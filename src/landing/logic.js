// Generated from the approved design artboard. Edit the design, then re-run scripts/convert-dc.mjs.
import { DCLogic } from './dc.js';

export class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = { menuOpen: false };
  }
  renderVals() {
    const gold = '#ffe2b2', mid = '#cfe3fa', blue = '#96c4f4';
    return {
      bookHref: (this.props.bookingUrl || '').trim() || 'mailto:sunil.kattikar@gmail.com?subject=Book%20a%20SIXXAB%20AI%20strategy%20call',
      menuOpen: this.state.menuOpen,
      toggleMenu: () => this.setState({ menuOpen: !this.state.menuOpen }),
      outcomes: [
        { tag: 'More customers', title: 'Marketing and sales that never stop', body: 'Agents write your posts, emails and replies, follow up on leads and track what works. You approve before anything goes out.', color: gold },
        { tag: 'More time', title: 'Operations and admin handled', body: 'A daily briefing, planned tasks and back-office work done for you, so you spend your day on customers and decisions.', color: mid },
        { tag: 'Clear growth', title: 'One plan from idea to $10M', body: 'A step-by-step roadmap with revenue milestones, costs and results you can see at a glance.', color: blue }
      ],
      steps: [
        { n: '01', k: 'Tell us about your business', v: 'A guided profile: your offer, customers, numbers and goals.' },
        { n: '02', k: 'Agents plan and do the work', v: 'Your founder agent sets the plan; executive agents carry it out.' },
        { n: '03', k: 'You approve what goes out', v: 'Customer messages and spending wait for your yes.' },
        { n: '04', k: 'Results improve every week', v: 'Outcomes are measured and the agents learn from your edits.' }
      ],
      proof: [
        'Pilots live with an orthopaedic hospital and a pathology lab',
        'Approved LinkedIn posts, comment replies and emails go out for real',
        'Approval rules enforced in the database, not left to the AI',
        'Every action recorded, with the AI cost of each task',
        'LinkedIn and Gmail today; WhatsApp, Google Business Profile and Instagram next'
      ],
      heads: [
        { n: '01', href: '/login?next=start', cta: 'Start my business', name: 'Start the business', stages: 'New and small · $0 to $10K a month', promise: 'From an idea to a validated offer and your first paying customers.', color: gold, border: 'rgba(255,226,178,.35)', bg: 'linear-gradient(180deg, rgba(255,226,178,.08), rgba(255,226,178,.015))' },
        { n: '02', href: '/login?next=scale', cta: 'Scale my business', name: 'Scale the business', stages: 'Growing · $10K to $100K a month', promise: 'Repeatable growth with a built-in AI marketing agency, sales and support.', color: mid, border: 'rgba(207,227,250,.3)', bg: 'linear-gradient(180deg, rgba(207,227,250,.07), rgba(207,227,250,.015))' },
        { n: '03', href: '/login?next=run', cta: 'Run my business', name: 'Run the business', stages: 'Established · $100K a month to $10M a year', promise: 'All 18 executive agents on one plan, running the business while you lead.', color: blue, border: 'rgba(150,196,244,.35)', bg: 'linear-gradient(180deg, rgba(150,196,244,.08), rgba(150,196,244,.015))' }
      ],
      plans: [
        { who: 'Startups & small businesses', name: 'Founder', price: '$5,000', href: '/login?next=start', cta: 'Start my business', color: gold, border: 'rgba(255,226,178,.3)', bg: 'rgba(255,255,255,.03)', btn: 'rgba(196,214,232,.6)', btnBg: 'transparent', btnInk: '#ffffff',
          features: ['Founder agents: niche, strategy and roadmap', 'Built-in AI marketing agency', 'Daily briefing and approvals'] },
        { who: 'Medium businesses', name: 'Growth', price: '$20,000', href: '#begin', cta: 'Plan my growth', color: mid, border: 'rgba(207,227,250,.45)', bg: 'linear-gradient(180deg, rgba(207,227,250,.08), rgba(207,227,250,.02))', btn: '#ffffff', btnBg: '#ffffff', btnInk: '#02060f',
          features: ['Everything in Founder', 'All 18 executive and department agents', 'Your existing systems connected'] },
        { who: 'Large businesses', name: 'Enterprise', price: '$50,000', href: '#begin', cta: 'Talk to us', color: blue, border: 'rgba(150,196,244,.4)', bg: 'rgba(255,255,255,.03)', btn: 'rgba(196,214,232,.6)', btnBg: 'transparent', btnInk: '#ffffff',
          features: ['AI governance and value map', 'Agents for each business unit', 'Single sign-on, audit trail, data residency'] }
      ]
    };
  }
}
