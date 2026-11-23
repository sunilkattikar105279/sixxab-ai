// Generated from the approved design artboard. Edit the design, then re-run scripts/convert-dc.mjs.
import { DCLogic } from './dc.js';

export class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = { menuOpen: false };
  }
  renderVals() {
    const gold = '#E7C766', mid = '#E7C766', blue = '#C9A227';
    return {
      bookHref: (this.props.bookingUrl || '').trim() || 'https://calendar.app.google/NoUzn3rFzoXdmwSh9',
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
        { n: '01', href: '/login?next=start', cta: 'Start my business', name: 'Start the business', stages: 'New and small · $0 to $10K a month', promise: 'From an idea to a validated offer and your first paying customers.', color: gold, border: 'rgba(231,199,102,.35)', bg: 'linear-gradient(180deg, rgba(231,199,102,.08), rgba(231,199,102,.015))' },
        { n: '02', href: '/login?next=scale', cta: 'Scale my business', name: 'Scale the business', stages: 'Growing · $10K to $100K a month', promise: 'Repeatable growth with a built-in AI marketing agency, sales and support.', color: mid, border: 'rgba(231,199,102,.3)', bg: 'linear-gradient(180deg, rgba(231,199,102,.07), rgba(231,199,102,.015))' },
        { n: '03', href: '/login?next=run', cta: 'Run my business', name: 'Run the business', stages: 'Established · $100K to $10M a month', promise: 'All 18 executive agents on one plan, running the business while you lead.', color: blue, border: 'rgba(201,162,39,.35)', bg: 'linear-gradient(180deg, rgba(201,162,39,.08), rgba(201,162,39,.015))' }
      ],
      plans: [
        { who: 'Startups & small businesses', name: 'Founder', price: '$5,000', href: '/login?next=start', cta: 'Start my business', color: gold, border: 'rgba(231,199,102,.3)', bg: 'rgba(255,255,255,.03)', btn: 'rgba(201,162,39,.6)', btnBg: 'transparent', btnInk: '#F3EBD8',
          features: ['Founder agents: niche, strategy and roadmap', 'Built-in AI marketing agency', 'Daily briefing and approvals'] },
        { who: 'Medium businesses', name: 'Growth', price: '$20,000', href: '#begin', cta: 'Plan my growth', color: mid, border: 'rgba(231,199,102,.45)', bg: 'linear-gradient(180deg, rgba(231,199,102,.08), rgba(231,199,102,.02))', btn: '#C9A227', btnBg: 'linear-gradient(180deg, #E7C766, #C9A227)', btnInk: '#1a1405',
          features: ['Everything in Founder', 'All 18 executive and department agents', 'Your existing systems connected'] },
        { who: 'Large businesses', name: 'Enterprise', price: '$50,000', href: '#begin', cta: 'Talk to us', color: blue, border: 'rgba(201,162,39,.4)', bg: 'rgba(255,255,255,.03)', btn: 'rgba(201,162,39,.6)', btnBg: 'transparent', btnInk: '#F3EBD8',
          features: ['AI governance and value map', 'Agents for each business unit', 'Single sign-on, audit trail, data residency'] }
      ]
    };
  }
}
