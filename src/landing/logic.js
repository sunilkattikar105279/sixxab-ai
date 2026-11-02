// Generated from the approved design artboard. Edit the design, then re-run scripts/convert-dc.mjs.
import { DCLogic } from './dc.js';

export class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = { menuOpen: false, tick: 0, snap: false, journey: 0, market: 'us' };
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
  certTiers(m) {
    const us = m === 'us';
    return [
      { kicker: 'Entry', name: 'Certified Consultant', color: '#ffe2b2', border: 'rgba(196,214,232,.2)', bg: 'rgba(255,255,255,.03)', btn: 'rgba(196,214,232,.72)', btnBg: 'transparent', btnInk: '#ffffff', cta: 'Apply as a consultant',
        tagline: 'For independent consultants starting their SIXXAB practice.',
        fee: us ? '$2,500' : '₹1,50,000', annual: us ? 'no license fee in year 1, $1,500 / year after' : 'no license fee in year 1, ₹75,000 / year after',
        rows: [
          { k: 'Revenue share', v: '15% of client subscriptions, 36 months' },
          { k: 'SIXXAB-sourced leads', v: '10% referral fee on year 1' },
          { k: 'Brand', v: 'Certified SIXXAB Consultant badge' },
          { k: 'Territory', v: 'Open, no exclusivity' },
          { k: 'Stay certified', v: '1 active client a year + annual recertification' }
        ] },
      { kicker: 'Most popular', name: 'Certified Partner', color: '#cfe3fa', border: 'rgba(207,227,250,.5)', bg: 'linear-gradient(180deg, rgba(207,227,250,.10), rgba(207,227,250,.02))', btn: '#ffffff', btnBg: '#ffffff', btnInk: '#02060f', cta: 'Apply as a partner',
        tagline: 'For established firms delivering all three SIXXAB paths.',
        fee: us ? '$15,000' : '₹5,00,000', annual: us ? '$6,000 / year license' : '₹2,00,000 / year license',
        rows: [
          { k: 'Revenue share', v: '20% of client subscriptions, 36 months' },
          { k: 'SIXXAB-sourced leads', v: 'Priority leads, 10% referral fee on year 1' },
          { k: 'Brand', v: 'Certified SIXXAB Partner, co-branded delivery' },
          { k: 'Territory', v: 'Open, featured in the partner directory' },
          { k: 'Stay certified', v: '2 active clients a year + annual recertification' }
        ] },
      { kicker: 'Exclusive', name: us ? 'Country Partner' : 'Regional Partner', color: '#96c4f4', border: 'rgba(150,196,244,.45)', bg: 'linear-gradient(180deg, rgba(150,196,244,.10), rgba(150,196,244,.02))', btn: 'rgba(196,214,232,.72)', btnBg: 'transparent', btnInk: '#ffffff', cta: 'Talk to us',
        tagline: us ? 'Own SIXXAB in a country or region, under your brand or ours.' : 'Own SIXXAB in an Indian state or region, under your brand or ours.',
        fee: us ? '$50,000' : '₹15,00,000', annual: us ? '$25,000 / year license' : '₹6,00,000 / year license',
        rows: [
          { k: 'Revenue share', v: '25% for 36 months, or white-label at 35% off list price' },
          { k: 'Recruiting', v: '5% of revenue from consultants you certify' },
          { k: 'Brand', v: 'White-label option: sell under your own brand' },
          { k: 'Territory', v: us ? 'Exclusive country or region' : 'Exclusive state or region' },
          { k: 'Stay certified', v: 'Annual growth targets agreed with SIXXAB' }
        ] }
    ];
  }
  journeyData() {
    const gold = '#ffe2b2', mid = '#cfe3fa', blue = '#96c4f4';
    return [
      { n: '01', who: 'Startups & small businesses', color: gold, border: 'rgba(255,226,178,.3)', toBg: 'rgba(255,226,178,.10)',
        title: 'Restart, scale and run your company with AI agents.',
        from: 'Just starting, stuck, or stretched too thin', to: 'A company that runs on agents, with you in command',
        cta: 'Start my path',
        steps: [
          { n: 1, title: 'Diagnose', body: 'A business health check places you on the SIXXAB path and shows what is holding you back.', agents: 'Strategy Coach, CFO', out: 'Stage report and top priorities', you: 'Confirm goals and stage' },
          { n: 2, title: 'Restart', body: 'Reset the niche, offer and pricing around real demand. Stop what is not working.', agents: 'Niche Selector, CSO, CPO', out: 'A validated offer', you: 'Choose the offer to back' },
          { n: 3, title: 'Plan', body: 'One goal, a 90-day roadmap and a weekly plan that every agent works to.', agents: 'Founder Orchestrator, Roadmap', out: '90-day roadmap', you: 'Approve the roadmap' },
          { n: 4, title: 'Staff with agents', body: 'Switch on the CXO and department agents your stage needs, and connect your tools.', agents: 'CEO, CMO, CRO, CFO + departments', out: 'Your AI team, live', you: 'Pick which agents start' },
          { n: 5, title: 'Grow', body: 'The built-in marketing agency, sales and support run every day. You approve spend and messages.', agents: '50 marketing agents, Deal Closer, Support', out: 'Leads, customers, revenue', you: 'Approve spend and messages' },
          { n: 6, title: 'Run', body: 'Morning briefings, approvals and the learning loop keep the company improving while you lead.', agents: 'Founder Orchestrator, Learning Engine', out: 'A self-improving company', you: 'Handle exceptions and big calls' }
        ],
        outcomes: ['Revenue before headcount', 'Founder time back', 'A clear next milestone', 'Costs that grow with you'] },
      { n: '02', who: 'Medium businesses', color: mid, border: 'rgba(207,227,250,.3)', toBg: 'rgba(207,227,250,.09)',
        title: 'Transition and scale to SIXXAB level.',
        from: 'Growing, but limited by people and process', to: 'SIXXAB level: a $10M company, built to keep growing',
        cta: 'Plan my transition',
        steps: [
          { n: 1, title: 'Assess', body: 'Map every department, process and tool. Score AI readiness and find the highest-return moves.', agents: 'COO, CIO', out: 'AI readiness map', you: 'Set the priorities' },
          { n: 2, title: 'Connect', body: 'Bring CRM, finance, support and data into one platform, with roles and approvals.', agents: 'CIO, CDO', out: 'One connected operating system', you: 'Grant access and roles' },
          { n: 3, title: 'Augment', body: 'Agents work alongside each team, taking repetitive work first. People review and approve.', agents: 'Department agents', out: 'Capacity without new hires', you: 'Review and approve agent work' },
          { n: 4, title: 'Orchestrate', body: 'All 18 CXO agents align to one company plan, with one live view for you and your board.', agents: 'Founder Orchestrator, 18 CXO', out: 'Board-ready plan and packs', you: 'Sign off the company plan' },
          { n: 5, title: 'Expand', body: 'Open new markets, products and industries with Startups in a Box.', agents: 'CGO, CINO, expansion agents', out: 'New revenue lines', you: 'Choose markets to enter' },
          { n: 6, title: 'Reach SIXXAB', body: 'Technology, data and security agents make growth durable as you pass Significance.', agents: 'CTO, CDO, CISO, CAIO', out: 'A $10M-ready company', you: 'Decide what runs autonomously' }
        ],
        outcomes: ['Growth not capped by hiring', 'Every department measured', 'One plan, board to front line', 'New markets in parallel'] },
      { n: '03', who: 'Large businesses', color: blue, border: 'rgba(150,196,244,.35)', toBg: 'rgba(150,196,244,.10)',
        title: 'Optimize and transform into an AI-driven company.',
        from: 'Complex, costly and slow to change', to: 'An AI-driven enterprise, with risk under control',
        cta: 'Talk to us about transformation',
        steps: [
          { n: 1, title: 'Discover', body: 'Review cost, processes and portfolio to find where AI moves profit and productivity most.', agents: 'CFO, COO, CAIO', out: 'AI value map and business case', you: 'Approve the business case' },
          { n: 2, title: 'Govern', body: 'Guardrails first: security, compliance, audit and stage-gates enforced by the platform.', agents: 'CISO, CLO', out: 'AI governance framework', you: 'Set risk limits and policies' },
          { n: 3, title: 'Pilot', body: 'Prove value in one business unit or function, with clear metrics, in weeks.', agents: 'Department agents', out: 'Measured pilot results', you: 'Pick the pilot and its metrics' },
          { n: 4, title: 'Optimize', body: 'Automate operations, finance and support, and retire duplicate tools and cost.', agents: 'COO, CFO, CIO', out: 'Lower cost to run', you: 'Approve what changes or retires' },
          { n: 5, title: 'Transform', body: 'Move to an AI-native operating model: CXO agents per business unit, Venture boxes for new lines.', agents: 'Founder Orchestrator, 18 CXO', out: 'AI-driven operating model', you: 'Lead the operating-model change' },
          { n: 6, title: 'Sustain', body: 'Build an AI center of excellence and train people to lead alongside agents.', agents: 'CHRO, CAIO, Learning Engine', out: 'Future-ready talent', you: 'Own the talent plan' }
        ],
        outcomes: ['Measurable profit', 'Higher productivity', 'Stronger brand value', 'Future-ready talent', 'Risk under control'] }
    ];
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
      journeys: this.journeyData().map((j, i) => {
        const on = i === this.state.journey;
        return { n: j.n, who: j.who, active: on, pick: () => this.setState({ journey: i }), tabBorder: on ? j.color : 'rgba(196,214,232,.3)', tabBg: on ? j.toBg : 'rgba(255,255,255,.03)', tabInk: on ? '#ffffff' : '#c9d2de', numInk: j.color };
      }),
      cur: this.journeyData()[this.state.journey],
      loopSteps: [
        { n: '01', who: 'Agents', k: 'Plan', v: 'Agents break the goal into tasks against the company plan.', color: '#ffe2b2', border: 'rgba(196,214,232,.14)', bg: 'rgba(2,6,15,.4)' },
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
        { n: '01', href: '#start', name: 'Start the company', stages: 'Startup → Struggle · $0 to $10K', promise: 'From an idea to a validated offer and your first paying customers.', color: gold, border: 'rgba(255,226,178,.35)', bg: 'linear-gradient(180deg, rgba(255,226,178,.08), rgba(255,226,178,.015))' },
        { n: '02', href: '#scale', name: 'Scale the company', stages: 'Scale → Success · $10K to $100K', promise: 'Repeatable growth with a built-in AI marketing agency, sales and support.', color: mid, border: 'rgba(207,227,250,.3)', bg: 'linear-gradient(180deg, rgba(207,227,250,.07), rgba(207,227,250,.015))' },
        { n: '03', href: '#run', name: 'Run the company', stages: 'Significance → SIXXAB · $100K to $10M', promise: 'All 18 CXO agents on one plan, running the company while you lead.', color: blue, border: 'rgba(150,196,244,.35)', bg: 'linear-gradient(180deg, rgba(150,196,244,.08), rgba(150,196,244,.015))' }
      ],
      details: [
        { id: 'start', n: '01', stages: 'Startup & Struggle', color: gold, wash: 'radial-gradient(70% 60% at 0% 0%, rgba(255,200,120,.08), rgba(2,6,15,0) 70%)',
          title: 'Start the company.', body: 'Most companies die before their first customer. SIXXAB gives you a strategist, a builder and a seller on day one, so you can go from idea to revenue without hiring anyone.',
          agents: 'Founder Orchestrator, Niche Selector, Personal Strategy Coach, Roadmap & Implementation, plus CEO, CSO, CPO, CMO, CRO and CFO agents.',
          cta: 'Start my company',
          items: [
            { tag: 'Validate', title: 'Pick the right niche', body: 'The Niche Selector tests your idea against real demand before you spend a dollar.' },
            { tag: 'Plan', title: 'Get a roadmap you can follow', body: 'Your strategy coach turns goals into a 90-day plan and a weekly to-do list.' },
            { tag: 'Launch', title: 'Brand, offer and website', body: 'Agents shape the offer, set the price and ship your site and first campaigns.' },
            { tag: 'Sell', title: 'Win the first customers', body: 'Lead finding, outreach and follow-up run every day until people pay.' }
          ] },
        { id: 'scale', n: '02', stages: 'Scale & Success', color: mid, wash: 'radial-gradient(70% 60% at 100% 0%, rgba(120,170,240,.10), rgba(2,6,15,0) 70%)',
          title: 'Scale the company.', body: 'Once people pay, the job changes: make growth repeatable and keep the business healthy. SIXXAB adds a full marketing agency, a sales team, a support desk and a back office.',
          agents: 'COO, CCO, CBO, CLO and CHRO agents, the 50-agent marketing agency, and sales, support and finance department agents.',
          cta: 'Scale my company',
          items: [
            { tag: 'Market', title: 'AI marketing agency, built in', body: 'Content, social, ads, SEO and email, planned and published every day.' },
            { tag: 'Sell', title: 'A pipeline that follows up itself', body: 'CRM stays current, quiet deals get nudged, and the next step is always owned.' },
            { tag: 'Serve', title: 'Support and success, any hour', body: 'Customers get answers in minutes; anything sensitive comes to you.' },
            { tag: 'Operate', title: 'Books, invoices and payroll', body: 'Collections, payables, month-end close and compliance stay on track.' }
          ] },
        { id: 'run', n: '03', stages: 'Significance & SIXXAB', color: blue, wash: 'radial-gradient(70% 60% at 0% 0%, rgba(120,170,240,.10), rgba(2,6,15,0) 70%)',
          title: 'Run the company.', body: 'At this stage you lead, and the company runs. The Founder Orchestrator keeps all 18 CXO agents working to one plan and reports to you and your board.',
          agents: 'All 18 CXO agents, including CTO, CIO, CDO, CISO, CAIO, CGO and CINO, plus technology and expansion department agents.',
          cta: 'Run my company',
          items: [
            { tag: 'Orchestrate', title: 'One plan, 18 executives', body: 'Every CXO agent works toward the same goals, with one view for you and the board.' },
            { tag: 'Build', title: 'Technology, data and security', body: 'Engineering, cloud, analytics and security agents keep the platform strong.' },
            { tag: 'Govern', title: 'Board packs and investor relations', body: 'Monthly packs, investor updates and fundraising support, always ready.' },
            { tag: 'Expand', title: 'New markets, US and India', body: 'Market entry, localization, partnerships and new products, run in parallel.' }
          ] }
      ],
      segments: [
        { who: 'Startups & solo founders', box: 'Start box', color: gold, border: 'rgba(255,226,178,.35)', bg: 'linear-gradient(180deg, rgba(255,226,178,.07), rgba(255,226,178,.015))',
          body: 'A whole company team for one founder, from idea to first revenue.',
          points: ['Founder agents and first six CXO agents', 'Launch-ready brand, site and offer', 'Industry playbook from day one'] },
        { who: 'Small & medium businesses', box: 'Growth box', color: mid, border: 'rgba(207,227,250,.3)', bg: 'linear-gradient(180deg, rgba(207,227,250,.06), rgba(207,227,250,.015))',
          body: 'Add an AI marketing agency, sales, support and back office to the team you already have.',
          points: ['Connects to the tools you already use', 'Agents work alongside your staff', 'Your data stays yours'] },
        { who: 'Large enterprises', box: 'Venture box', color: blue, border: 'rgba(150,196,244,.38)', bg: 'linear-gradient(180deg, rgba(150,196,244,.08), rgba(150,196,244,.015))',
          body: 'Launch a new business line, product or market with an AI team, inside your governance.',
          points: ['Single sign-on, roles and audit trail', 'Stage-gates enforced in the platform', 'Regional data and compliance options'] }
      ],
      industries: [
        { name: 'Healthcare & clinics', tag: 'Pilot', border: 'rgba(255,226,178,.45)' },
        { name: 'Home services', tag: '', border: 'rgba(196,214,232,.22)' },
        { name: 'Professional services', tag: '', border: 'rgba(196,214,232,.22)' },
        { name: 'Retail & e-commerce', tag: '', border: 'rgba(196,214,232,.22)' },
        { name: 'Real estate', tag: '', border: 'rgba(196,214,232,.22)' },
        { name: 'Education & coaching', tag: '', border: 'rgba(196,214,232,.22)' },
        { name: 'Hospitality & food', tag: '', border: 'rgba(196,214,232,.22)' },
        { name: 'Manufacturing', tag: '', border: 'rgba(196,214,232,.22)' },
        { name: 'Financial services', tag: '', border: 'rgba(196,214,232,.22)' },
        { name: 'Technology & SaaS', tag: '', border: 'rgba(196,214,232,.22)' }
      ],
      markets: [
        { name: 'United States', status: 'Launch market', color: gold },
        { name: 'India', status: 'Launch market', color: gold },
        { name: '[NEXT MARKET]', status: 'Planned', color: '#8d96a8' },
        { name: '[NEXT MARKET]', status: 'Planned', color: '#8d96a8' }
      ],
      boxParts: [
        { k: 'Agents', v: 'The right founder, CXO and department agents for the stage.' },
        { k: 'Playbooks', v: 'Industry workflows, offers and campaigns that already work.' },
        { k: 'Integrations', v: 'CRM, payments, email, social and accounting, connected.' },
        { k: 'Compliance', v: 'Local rules and approvals built into every workflow.' },
        { k: 'Local fit', v: 'Language, currency and payments for each market.' }
      ],
      agency: [
        { title: 'Strategy & calendar', body: 'A monthly plan built from what sells and when.' },
        { title: 'Content & video', body: 'Posts, reels and articles written in your voice.' },
        { title: 'Social publishing', body: 'Scheduled across every channel, every day.' },
        { title: 'Paid ads', body: 'Campaigns tested and budgets moved to what works.' },
        { title: 'SEO & AI visibility', body: 'Found on Google and in AI answers.' },
        { title: 'Email & messaging', body: 'Newsletters, sequences and win-back campaigns.' },
        { title: 'Reviews & reputation', body: 'More reviews, and every one answered.' },
        { title: 'Leads & speed-to-lead', body: 'New leads contacted in minutes, not days.' }
      ],
      layers: [
        { count: '1', name: 'Founder Orchestrator', body: 'Sets one goal and one plan, and aligns every agent to it.', color: gold, border: 'rgba(255,226,178,.35)' },
        { count: '18', name: 'CXO agents', body: 'Strategy, product, marketing, revenue, finance, operations, technology and more.', color: '#e8ecf0', border: 'rgba(196,214,232,.25)' },
        { count: '50', name: 'Marketing agents', body: 'Your built-in AI marketing agency.', color: mid, border: 'rgba(207,227,250,.25)' },
        { count: '∞', name: 'Learning loop', body: 'Act, measure, learn, improve. Every agent, every day.', color: blue, border: 'rgba(150,196,244,.3)' }
      ],
      certSteps: [
        { n: '01', k: 'Apply', v: 'Consultants with strategy, transformation or industry experience apply.' },
        { n: '02', k: 'Train', v: 'The SIXXAB Framework, the three paths, loop engineering and AI governance.' },
        { n: '03', k: 'Certify', v: 'An assessment plus a supervised first client delivery.' },
        { n: '04', k: 'License', v: 'Platform access to run SIXXAB for your own clients, under your practice.' },
        { n: '05', k: 'Deliver & grow', v: 'Take clients through their path and join the global partner network.' }
      ],
      marketTabs: [['us', 'United States · USD'], ['in', 'India · INR']].map((m) => {
        const on = this.state.market === m[0];
        return { label: m[1], active: on, pick: () => this.setState({ market: m[0] }), bg: on ? '#ffffff' : 'transparent', ink: on ? '#02060f' : '#c9d2de' };
      }),
      certNote: this.state.market === 'us' ? 'United States pricing in USD.' : 'India pricing in INR, built for the Indian consulting market.',
      tiersCert: this.certTiers(this.state.market),
      certGets: ['SIXXAB platform license for your clients', 'All agents, playbooks and Startups in a Box', 'Delivery toolkit: assessments, roadmaps, board packs', 'Listing in the global consultant directory', 'Recurring revenue from client subscriptions', 'Ongoing training as the platform improves'],
      plans: [
        { n: '01', who: 'Startups & small businesses', name: 'Founder', price: '$5,000', body: 'Restart, scale and run your company with AI agents.', cta: 'Start my path', color: gold, border: 'rgba(255,226,178,.3)', bg: 'rgba(255,255,255,.03)', btn: 'rgba(196,214,232,.72)', btnBg: 'transparent', btnInk: '#ffffff',
          features: ['Founder agents: Niche Selector, Strategy Coach, Roadmap', 'Founder Orchestrator with core CXO agents', 'Built-in AI marketing agency', 'Sales, support and back-office agents', 'Daily briefing and approvals'] },
        { n: '02', who: 'Medium businesses', name: 'Growth', price: '$20,000', body: 'Transition and scale your company to SIXXAB level.', cta: 'Plan my transition', color: mid, border: 'rgba(207,227,250,.45)', bg: 'linear-gradient(180deg, rgba(207,227,250,.09), rgba(207,227,250,.02))', btn: '#ffffff', btnBg: '#ffffff', btnInk: '#02060f',
          features: ['Everything in Founder', 'All 18 CXO agents and department agents', 'Your existing systems connected', 'Done-for-you marketing agency option', 'Startups in a Box for new markets and products'] },
        { n: '03', who: 'Large businesses', name: 'Enterprise', price: '$50,000', body: 'Optimize and transform into an AI-driven company.', cta: 'Talk to us', color: blue, border: 'rgba(150,196,244,.45)', bg: 'linear-gradient(180deg, rgba(150,196,244,.10), rgba(150,196,244,.02))', btn: 'rgba(196,214,232,.72)', btnBg: 'transparent', btnInk: '#ffffff',
          features: ['AI value map and governance framework', 'Pilot to enterprise-wide rollout', 'CXO agents for each business unit', 'Single sign-on, audit trail, regional data options', 'AI center of excellence and talent training'] }
      ]
    };
  }
}
