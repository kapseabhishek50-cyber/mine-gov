import { list } from '../config/database.js';
import { calculateRisk } from './riskEngine.js';

export class AIProvider {
  async answer() { throw new Error('AI provider must implement answer().'); }
}

export class OpenAICompatibleProvider extends AIProvider {
  constructor(apiKey, model, baseUrl = 'https://api.openai.com/v1') { super(); this.apiKey = apiKey; this.model = model; this.baseUrl = baseUrl; }
  async answer(question, context) {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, temperature: 0.2, messages: [
        { role: 'system', content: `You are MineGov AI, an assistant for coal-mine compliance and governance. Answer only from the supplied JSON data. Never invent mines, counts, dates, people, or compliance facts. If information is missing, say so. Explain official risk scores as deterministic backend calculations; do not change them. Cite record names where possible. Data: ${JSON.stringify(context)}` },
        { role: 'user', content: question },
      ] }),
    });
    if (!response.ok) throw new Error(`AI provider returned ${response.status}`);
    const json = await response.json();
    return json.choices?.[0]?.message?.content || 'I could not form a response from the available records.';
  }
}

export class GeminiProvider extends AIProvider {
  constructor(apiKey, model) { super(); this.apiKey = apiKey; this.model = model || 'gemini-1.5-flash'; }
  async answer(question, context) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      systemInstruction: { parts: [{ text: `You are MineGov AI. Use only supplied application records. Never invent facts; if absent say so. Risk scores are calculated by deterministic application logic and must not be altered. Data: ${JSON.stringify(context)}` }] },
      contents: [{ role: 'user', parts: [{ text: question }] }], generationConfig: { temperature: 0.2 },
    }) });
    if (!response.ok) throw new Error(`Gemini returned ${response.status}`);
    const json = await response.json();
    return json.candidates?.[0]?.content?.parts?.map((part) => part.text).join('') || 'I could not form a response from the available records.';
  }
}

export class FallbackProvider extends AIProvider {
  async answer(question, context) {
    const q = question.toLowerCase();
    const mine = context.mines.find((item) => q.includes(item.name.toLowerCase()) || q.includes(item.code.toLowerCase())) || context.mines.find((item) => item.riskScore >= 61);
    if (q.includes('overdue') && q.includes('compliance')) {
      const records = context.compliances.filter((item) => item.status === 'OVERDUE');
      return records.length ? `There are ${records.length} overdue compliance requirement${records.length === 1 ? '' : 's'} across the portfolio. ${records.slice(0, 5).map((item) => `${item.title} at ${context.mineName(item.mineId)}`).join('; ')}${records.length > 5 ? '; and more in the compliance register' : ''}.` : 'There are no overdue compliance requirements in the current records.';
    }
    if (q.includes('high-risk') || q.includes('high risk') || q.includes('risk mines')) {
      const records = context.mines.filter((item) => item.riskScore >= 61).sort((a, b) => b.riskScore - a.riskScore);
      return records.length ? `I found ${records.length} high-risk mine${records.length === 1 ? '' : 's'}: ${records.map((item) => `${item.name} (${item.riskLevel}, ${item.riskScore}/100)`).join(', ')}. Scores are calculated by the deterministic risk engine.` : 'No mines are currently scored HIGH or CRITICAL.';
    }
    if (q.includes('pending action') || q.includes('officer')) {
      const pending = context.actions.filter((item) => !['VERIFIED'].includes(item.status));
      const counts = new Map();
      for (const item of pending) {
        const name = context.userName(item.assignedOfficer) || 'Unassigned';
        counts.set(name, (counts.get(name) || 0) + 1);
      }
      return pending.length ? `${pending.length} corrective actions are not yet verified. By assigned officer: ${[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => `${name} (${count})`).join(', ')}.` : 'All corrective actions are verified.';
    }
    if (q.includes('repeated') && q.includes('safety')) {
      const safety = context.violations.filter((item) => item.category === 'Safety' && item.status !== 'CLOSED');
      const counts = new Map();
      for (const item of safety) counts.set(String(item.mineId), (counts.get(String(item.mineId)) || 0) + 1);
      const repeated = [...counts.entries()].filter(([, count]) => count > 1);
      return repeated.length ? `Repeated open safety violations are present at ${repeated.map(([id, count]) => `${context.mineName(id)} (${count})`).join(', ')}. The underlying records are linked in the register.` : `I found ${safety.length} open safety violation${safety.length === 1 ? '' : 's'}, but no mine has more than one open safety finding in the current data.`;
    }
    if (q.includes('monthly') || q.includes('summary')) {
      const overdue = context.compliances.filter((item) => item.status === 'OVERDUE').length;
      const open = context.violations.filter((item) => item.status !== 'CLOSED').length;
      const verified = context.actions.filter((item) => item.status === 'VERIFIED').length;
      const high = context.mines.filter((item) => item.riskScore >= 61).length;
      return `Portfolio summary: ${context.mines.length} mines are monitored, portfolio compliance is ${context.portfolioCompliance}%, and ${high} mines are HIGH or CRITICAL risk. The records contain ${overdue} overdue compliance requirements, ${open} open violations, and ${verified} verified corrective actions. Prioritize overdue statutory items and closure evidence at the highest-risk sites.`;
    }
    if (q.includes('why') || q.includes('major risk') || q.includes('risks')) {
      if (!mine) return 'Please name a mine or ask for high-risk mines. I can only explain scores using records currently in MineGov.';
      const risk = calculateRisk({ mineId: mine.id, violations: context.violations, compliances: context.compliances, actions: context.actions });
      return `${mine.name} has an official risk score of ${risk.score}/100 (${risk.level}). The score is deterministic: 30% severity, 25% overdue pressure, 20% repeated violations, 15% compliance gap, and 10% unresolved actions. Current factors: ${risk.factors.join('; ')}. The score is calculated by the application, not by AI.`;
    }
    if (q.includes('abc')) return 'I could not find a mine named ABC Mine in the current database. Try a mine name such as Wardha Open Cast Mine, or ask to show high-risk mines.';
    return `I can answer questions from ${context.mines.length} mine records, ${context.compliances.length} compliance requirements, ${context.violations.length} violations, and ${context.actions.length} corrective actions. Try asking about overdue compliance, high-risk mines, repeated safety violations, pending actions, or a monthly summary.`;
  }
}

export class MineGovAIService {
  constructor() {
    this.provider = null;
    const key = process.env.AI_API_KEY;
    const choice = (process.env.AI_PROVIDER || 'auto').toLowerCase();
    if (key && choice === 'gemini') this.provider = new GeminiProvider(key, process.env.AI_MODEL);
    else if (key && ['openai', 'openai-compatible'].includes(choice)) this.provider = new OpenAICompatibleProvider(key, process.env.AI_MODEL || 'gpt-4o-mini', process.env.AI_BASE_URL);
    else if (key && choice === 'auto' && /gemini/i.test(process.env.AI_MODEL || '')) this.provider = new GeminiProvider(key, process.env.AI_MODEL);
    else if (key && choice === 'auto') this.provider = new OpenAICompatibleProvider(key, process.env.AI_MODEL || 'gpt-4o-mini', process.env.AI_BASE_URL);
    this.fallback = new FallbackProvider();
  }

  async buildContext(user) {
    let [mines, compliances, violations, actions, users] = await Promise.all([list('mines'), list('compliances'), list('violations'), list('actions'), list('users')]);
    if (user && !['ADMIN', 'MANAGEMENT'].includes(user.role)) {
      const mineId = String(user.mineId || '');
      mines = mines.filter((item) => String(item.id) === mineId);
      compliances = compliances.filter((item) => String(item.mineId) === mineId);
      violations = violations.filter((item) => String(item.mineId) === mineId);
      actions = actions.filter((item) => String(item.mineId) === mineId);
      users = users.filter((item) => String(item.id) === String(user.id) || String(item.mineId || '') === mineId);
    }
    const total = compliances.length;
    const portfolioCompliance = total ? Math.round(compliances.filter((item) => item.status === 'COMPLIANT').length / total * 100) : 0;
    return {
      mines, compliances, violations, actions,
      portfolioCompliance,
      mineName: (id) => mines.find((item) => String(item.id) === String(id))?.name || 'Unknown mine',
      userName: (id) => users.find((user) => String(user.id) === String(id))?.name || 'Unassigned',
    };
  }

  async answer(question, user) {
    const context = await this.buildContext(user);
    if (this.provider) {
      try { return { answer: await this.provider.answer(question, context), provider: this.provider.constructor.name, sources: this.sourceList(question, context) }; }
      catch (error) { console.warn(`AI provider failed; using deterministic fallback: ${error.message}`); }
    }
    return { answer: await this.fallback.answer(question, context), provider: 'Deterministic data assistant', sources: this.sourceList(question, context) };
  }

  sourceList(question, context) {
    const q = question.toLowerCase();
    const mine = context.mines.find((item) => q.includes(item.name.toLowerCase()) || q.includes(item.code.toLowerCase()));
    const sources = [];
    if (mine) sources.push({ label: mine.name, type: 'Mine', id: mine.id, href: `/mines/${mine.id}` });
    const overdue = context.compliances.filter((item) => item.status === 'OVERDUE');
    if (q.includes('overdue') && overdue.length) sources.push({ label: `${overdue.length} overdue compliance records`, type: 'Compliance', href: '/compliance' });
    if (q.includes('violation') || q.includes('safety')) sources.push({ label: `${context.violations.length} violation records`, type: 'Violations', href: '/violations' });
    if (q.includes('action') || q.includes('officer')) sources.push({ label: `${context.actions.length} corrective actions`, type: 'Actions', href: '/actions' });
    if (!sources.length) sources.push({ label: `${context.mines.length} monitored mines`, type: 'Portfolio', href: '/mines' });
    return sources;
  }
}

export const aiService = new MineGovAIService();
