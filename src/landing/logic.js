// Generated from the approved design artboard. Edit the design, then re-run scripts/convert-dc.mjs.
import { DCLogic } from './dc.js';

export class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = { menuOpen: false, tick: 0, snap: false };
  }
  componentDidMount() {
    this.timer = setInterval(() => {
      const next = this.state.tick + 1;
      this.setState({ tick: next, snap: false });
      if (next === 6) {
        this.snapTimer = setTimeout(() => this.setState({ tick: 0, snap: true }), 700);
      }
    }, 2400);
  }
  componentWillUnmount() {
    clearInterval(this.timer);
    clearTimeout(this.snapTimer);
  }
  renderVals() {
    const v = this.props.veilStrength ?? 0.35;
    const veil = 'radial-gradient(130% 50% at 50% 45%, rgba(6,10,18,' + (v * 1.1).toFixed(2) + ') 0%, rgba(6,10,18,' + (v * 0.5).toFixed(2) + ') 55%, rgba(6,10,18,0) 100%), linear-gradient(180deg, rgba(6,10,18,' + (v * 0.6).toFixed(2) + ') 0%, rgba(6,10,18,0) 22%, rgba(6,10,18,0) 70%, #02060f 100%)';
    const gold = '#ffe2b2', mid = '#cfe3fa', blue = '#96c4f4';
    return {
      veil: veil,
      showVideo: this.props.showVideo ?? true,
      bookHref: (this.props.bookingUrl || '').trim() || 'mailto:sunil.kattikar@gmail.com?subject=Book%20a%20SIXXAB%20AI%20strategy%20call',
      menuOpen: this.state.menuOpen,
      toggleMenu: () => this.setState({ menuOpen: !this.state.menuOpen }),
      loopSteps: [
        { n: '01', who: 'Agents', k: 'Plan', v: 'Agents break the goal into tasks against the business plan.', color: '#ffe2b2', border: 'rgba(196,214,232,.14)', bg: 'rgba(2,6,15,.4)' },
        { n: '02', who: 'Agents', k: 'Act', v: 'They draft, build, publish, sell and serve within guardrails.', color: '#ffe2b2', border: 'rgba(196,214,232,.14)', bg: 'rgba(2,6,15,.4)' },
        { n: '03', who: 'Human', k: 'Review & approve', v: 'Spend, customer messages and big calls wait for your yes.', color: '#ffffff', border: 'rgba(255,255,255,.45)', bg: 'rgba(255,255,255,.07)' },
        { n: '04', who: 'Platform', k: 'Measure', v: 'Results, costs and customer replies are tracked automatically.', color: '#96c4f4', border: 'rgba(196,214,232,.14)', bg: 'rgba(2,6,15,.4)' },
        { n: '05', who: 'Platform', k: 'Learn', v: 'Your edits, approvals and outcomes go into shared memory.', color: '#96c4f4', border: 'rgba(196,214,232,.14)', bg: 'rgba(2,6,15,.4)' },
        { n: '06', who: 'Platform', k: 'Improve', v: 'Agents and playbooks are updated before the next run.', color: '#96c4f4', border: 'rgba(196,214,232,.14)', bg: 'rgba(2,6,15,.4)' }
      ],
      autonomy: [
        { n: 1, k: 'Assist', v: 'Agents draft and recommend. People do the work and decide.', color: '#ffe2b2', border: 'rgba(255,226,178,.3)', bg: 'rgba(255,226,178,.04)' },
        { n: 2, k: 'Approve', v: 'Agents do the work. People approve before anything goes out.', color: '#cfe3fa', border: 'rgba(207,227,250,.3)', bg: 'rgba(207,227,250,.04)' },
        { n: 3, k: 'Autonomous', v: 'Agents run within your limits. People handle exceptions and review the daily briefing.', color: '#96c4f4', border: 'rgba(150,196,244,.4)', bg: 'rgba(150,196,244,.07)' }
      ],
      lines: ['plans your roadmap.', 'ships your code.', 'runs your ads.', 'replies to customers.', 'closes your deals.', 'posts your tweets.', 'plans your roadmap.'],
      tickerShift: 'translateY(' + (-1.3 * this.state.tick) + 'em)',
      tickerEase: this.state.snap ? 'none' : 'transform .65s cubic-bezier(.16,1,.3,1)',
      stages: [
        { name: 'Startup', money: '$0', bar: gold },
        { name: 'Struggle', money: '$10K', bar: gold },
        { name: 'Scale', money: '$50K', bar: mid },
        { name: 'Success', money: '$100K', bar: mid },
        { name: 'Significance', money: '$1M', bar: blue },
        { name: 'SIXXAB', money: '$10M', bar: blue }
      ],
      heads: [
        { n: '01', href: '/login?next=start', cta: 'Start my business', name: 'Start the business', stages: 'Startup → Struggle · $0 to $10K', promise: 'From an idea to a validated offer and your first paying customers.', color: gold, border: 'rgba(255,226,178,.35)', bg: 'linear-gradient(180deg, rgba(255,226,178,.08), rgba(255,226,178,.015))' },
        { n: '02', href: '/login?next=scale', cta: 'Scale my business', name: 'Scale the business', stages: 'Scale → Success · $10K to $100K', promise: 'Repeatable growth with a built-in AI marketing agency, sales and support.', color: mid, border: 'rgba(207,227,250,.3)', bg: 'linear-gradient(180deg, rgba(207,227,250,.07), rgba(207,227,250,.015))' },
        { n: '03', href: '/login?next=run', cta: 'Run my business', name: 'Run the business', stages: 'Significance → SIXXAB · $100K to $10M', promise: 'All 18 CXO agents on one plan, running the business while you lead.', color: blue, border: 'rgba(150,196,244,.35)', bg: 'linear-gradient(180deg, rgba(150,196,244,.08), rgba(150,196,244,.015))' }
      ],
      more: [
        { tag: 'Done for you', title: 'AI marketing agency', body: '50 marketing agents run content, social, ads, SEO and email. You approve the plan and the spend.', href: '#begin', color: gold, border: 'rgba(255,226,178,.3)' },
        { tag: 'Any industry, any market', title: 'Startups in a Box', body: 'Agents, playbooks and integrations packaged for one industry and one market, live in days.', href: '#begin', color: mid, border: 'rgba(207,227,250,.3)' },
        { tag: 'For consultants', title: 'SIXXAB certification', body: 'Deliver SIXXAB to clients in your country, with the platform, the playbooks and recurring revenue.', href: 'mailto:sunil.kattikar@gmail.com?subject=SIXXAB%20consultant%20certification', color: blue, border: 'rgba(150,196,244,.35)' }
      ],
      layers: [
        { count: '1', name: 'Founder Orchestrator', body: 'Sets one goal and one plan, and aligns every agent to it.', color: gold, border: 'rgba(255,226,178,.35)' },
        { count: '18', name: 'CXO agents', body: 'Strategy, product, marketing, revenue, finance, operations, technology and more.', color: '#e8ecf0', border: 'rgba(196,214,232,.25)' },
        { count: '50', name: 'Marketing agents', body: 'Your built-in AI marketing agency.', color: mid, border: 'rgba(207,227,250,.25)' },
        { count: '∞', name: 'Learning loop', body: 'Act, measure, learn, improve. Every agent, every day.', color: blue, border: 'rgba(150,196,244,.3)' }
      ],
      plans: [
        { n: '01', who: 'Startups & small businesses', name: 'Founder', price: '$5,000', body: 'Restart, scale and run your business with AI agents.', cta: 'Start my path', color: gold, border: 'rgba(255,226,178,.3)', bg: 'rgba(255,255,255,.03)', btn: 'rgba(196,214,232,.72)', btnBg: 'transparent', btnInk: '#ffffff',
          features: ['Founder agents: Niche Selector, Strategy Coach, Roadmap', 'Founder Orchestrator with core CXO agents', 'Built-in AI marketing agency', 'Sales, support and back-office agents', 'Daily briefing and approvals'] },
        { n: '02', who: 'Medium businesses', name: 'Growth', price: '$20,000', body: 'Transition and scale your business to SIXXAB level.', cta: 'Plan my transition', color: mid, border: 'rgba(207,227,250,.45)', bg: 'linear-gradient(180deg, rgba(207,227,250,.09), rgba(207,227,250,.02))', btn: '#ffffff', btnBg: '#ffffff', btnInk: '#02060f',
          features: ['Everything in Founder', 'All 18 CXO agents and department agents', 'Your existing systems connected', 'Done-for-you marketing agency option', 'Startups in a Box for new markets and products'] },
        { n: '03', who: 'Large businesses', name: 'Enterprise', price: '$50,000', body: 'Optimize and transform into an AI-driven business.', cta: 'Talk to us', color: blue, border: 'rgba(150,196,244,.45)', bg: 'linear-gradient(180deg, rgba(150,196,244,.10), rgba(150,196,244,.02))', btn: 'rgba(196,214,232,.72)', btnBg: 'transparent', btnInk: '#ffffff',
          features: ['AI value map and governance framework', 'Pilot to enterprise-wide rollout', 'CXO agents for each business unit', 'Single sign-on, audit trail, regional data options', 'AI center of excellence and talent training'] }
      ]
    };
  }
}
