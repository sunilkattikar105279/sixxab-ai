// The founder → CFO raise workflow: Prepare (founder + CFO), Raise (outreach to close) and an
// optional Pre-orders track: founding members pay for the product in advance (a sale, not equity).
// Hard dependencies block a step. Agents plan, draft and record; every investor email and every
// public post goes out only after a person approves it.

export type RaiseTrack = 'Prepare' | 'Raise' | 'Pre-orders';

export interface RaiseStepDef {
  id: string;
  track: RaiseTrack;
  title: string;
  summary: string;
  agentId: string | null;
  owner: string;
  hard: string[];
  goal: string;
}

export const RAISE_STEPS: RaiseStepDef[] = [
  {
    id: 'model', track: 'Prepare', title: 'Financial model and runway', agentId: 'cfo', owner: 'Founder confirms the numbers',
    summary: '18-month plan from recorded revenue and costs: burn, runway and what the money buys.', hard: [],
    goal: 'Build an 18-month financial model for the raise from the revenue and costs I have recorded: monthly burn, runway with and without the raise, and a use-of-funds split. Mark every assumption. Save it as a note titled "Raise: financial model".',
  },
  {
    id: 'entity', track: 'Prepare', title: 'Company, cap table and IP ready', agentId: 'clo', owner: 'Founder and lawyer confirm',
    summary: 'Checklist: the right entity for US investors, founder shares, IP assignment and a clean cap table.', hard: [],
    goal: 'Write the readiness checklist a US seed investor expects before buying shares: entity (usually a Delaware C-corp; note what changes if the business is an Indian company), authorised shares, founder stock and 83(b) elections, IP assignment to the company, an option pool decision, board consent, and a cap table in a tool such as Carta. Mark each item for a lawyer to confirm. Save it as a note titled "Raise: company readiness".',
  },
  {
    id: 'terms', track: 'Prepare', title: 'Round terms', agentId: 'cfo', owner: 'Founder sets the round',
    summary: 'CFO proposes size, valuation and instrument from the model; the founder sets them in Round terms.', hard: ['model'],
    goal: 'From the financial model and the round terms recorded below, check the round: amount, pre-money and post-money valuation, the percentage investors get, price per share given the fully diluted share count (ask for it if unknown), option pool, and minimum cheque. Show the arithmetic, compare it with a post-money SAFE at the same valuation, and list what a lawyer should confirm. Save it as a note titled "Raise: proposed terms".',
  },
  {
    id: 'deck', track: 'Prepare', title: 'Pitch deck and one-pager', agentId: 'investor-relations', owner: 'Founder approves the story',
    summary: 'Problem, solution, traction, market, model, team, the ask and use of funds.', hard: ['terms'],
    goal: 'Draft the outline of a 10-slide pitch deck and a one-page investor brief: problem, solution, product, traction (only what is recorded), market, business model, go-to-market, team, the ask and use of funds. Save it as a note titled "Raise: deck outline".',
  },
  {
    id: 'dataroom', track: 'Prepare', title: 'Data room', agentId: 'cfo', owner: 'Founder uploads the files',
    summary: 'The documents investors ask for, in one shared folder.', hard: ['model', 'entity'],
    goal: 'List the data room an early-stage investor expects, grouped by corporate, financial, product, customers and team, with which documents exist already and which are missing. Save it as a note titled "Raise: data room".',
  },
  {
    id: 'list', track: 'Raise', title: 'Target investor list', agentId: 'fundraising', owner: 'Founder picks who to approach',
    summary: 'Angels, syndicates, funds and accelerators that back this stage and sector.', hard: ['terms'],
    goal: 'Describe the investor profile for this round (cheque size, stage, sector, geography) and the kinds of investors to approach first. Start from people the founder already knows. Save it as a note titled "Raise: target investors".',
  },
  {
    id: 'outreach', track: 'Raise', title: 'Outreach', agentId: 'fundraising', owner: 'Founder approves every email',
    summary: 'Personal emails drafted per investor; each waits in Approvals.', hard: ['deck', 'list'], goal: '',
  },
  {
    id: 'meetings', track: 'Raise', title: 'Meetings and diligence', agentId: 'fundraising', owner: 'Founder takes the meetings',
    summary: 'Prep notes per meeting, follow-ups, answers to diligence questions.', hard: ['outreach', 'dataroom'],
    goal: 'Prepare a meeting brief for the investors now in meetings or diligence: what each cares about, likely questions with answers from recorded facts, and the follow-up to send. Save it as a note titled "Raise: meeting briefs".',
  },
  {
    id: 'close', track: 'Raise', title: 'Sign and close', agentId: 'clo', owner: 'Founder signs; lawyer reviews',
    summary: 'Round documents signed, money received, shares issued, cap table updated.', hard: ['meetings'],
    goal: 'Write the closing checklist for the committed investors, matching the instrument recorded below. For a priced round: term sheet, stock purchase agreement and charter amendment (NVCA-style seed documents), board and stockholder consents, e-signature, wire instructions confirmed by phone, funds received, shares issued, cap table updated. Add the filings a lawyer should confirm, such as Form D within 15 days of the first sale and state notices. Save it as a note titled "Raise: closing checklist".',
  },
  {
    id: 'updates', track: 'Raise', title: 'Monthly investor updates', agentId: 'investor-relations', owner: 'Founder approves each update',
    summary: 'Highlights, numbers, asks; the same every month.', hard: ['close'],
    goal: 'Draft this month’s investor update from recorded numbers: highlights, revenue, burn and runway, lowlights, and 3 specific asks. Save it as a note titled "Raise: investor update".',
  },
  {
    id: 'po-offer', track: 'Pre-orders', title: 'Founding-member offer', agentId: 'cro', owner: 'Founder sets the tiers',
    summary: 'What founding members pay now, what they get and when; up to 6 tiers.', hard: [],
    goal: 'Design a founding-member pre-order offer for this business: 2 to 4 tiers (name, price, limited quantity, exactly what the backer gets and when), priced against the regular plans, plus a realistic delivery date and refund promise. These are product sales, not shares; never call backers investors. Save it as a note titled "Pre-orders: offer".',
  },
  {
    id: 'po-page', track: 'Pre-orders', title: 'Payment page and terms', agentId: 'clo', owner: 'Founder creates the payment link',
    summary: 'A Stripe or Razorpay link (or Kickstarter/Indiegogo page), with clear delivery and refund terms.', hard: ['po-offer'],
    goal: 'Write the pre-order terms to show on the payment page: what is sold, delivery date, what happens if delivery slips (customers can cancel for a full refund), refund policy, taxes, and that this is not an investment. Then list the steps to create a Stripe Payment Link (USD) and a Razorpay Payment Page (INR). Save it as a note titled "Pre-orders: page and terms".',
  },
  {
    id: 'po-launch', track: 'Pre-orders', title: 'Campaign launch', agentId: 'cmo', owner: 'Founder approves every post',
    summary: 'A 30-day plan of posts and emails to customers and followers; each post waits for approval.', hard: ['po-page'],
    goal: 'Plan a 30-day founding-member campaign: launch post, weekly progress posts, emails to the people who already know us, and a last-chance post. Every message links to the payment page and repeats the delivery date. Never mention the equity round or call backers investors. Save it as a note titled "Pre-orders: launch plan".',
  },
  {
    id: 'po-fulfil', track: 'Pre-orders', title: 'Deliver and convert', agentId: 'coo', owner: 'Founder confirms delivery',
    summary: 'Onboard every founding member on time, then turn them into subscribers and testimonials.', hard: ['po-launch'],
    goal: 'Write the delivery plan for founding members: onboarding order, a status email to send if any date slips (with the option to cancel for a refund), how to collect feedback, and how to convert them into 12-month subscribers. Save it as a note titled "Pre-orders: delivery".',
  },
];
