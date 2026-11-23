// @ts-nocheck
// Generated from the approved design artboard by scripts/convert-dc.mjs. Do not hand-edit layout here.
import React from 'react';
import { useDC } from './dc.js';
import { Component } from './logic.js';

export default function Landing(props) {
  const v = useDC(Component, props);
  return (<>
<div style={{"width": "100%", "minWidth": "0", "background": "#071426", "color": "#F3EBD8", "fontFamily": "'Manrope', system-ui, sans-serif"}}>
<header style={{"position": "relative", "background": "#071426", "height": "88vh", "minHeight": "660px", "maxHeight": "900px", "overflow": "hidden", "display": "flex", "flexDirection": "column"}}>
<nav aria-label="Main" style={{"position": "relative", "zIndex": "5", "display": "flex", "alignItems": "center", "justifyContent": "space-between", "gap": "16px", "padding": "36px clamp(22px, 8vw, 120px) 0"}}>
<a href="/" aria-label="SIXXAB AI home" style={{"display": "flex", "alignItems": "center", "gap": "11px", "lineHeight": "1"}}>
<svg viewBox="0 0 50 42" width="46" height="39" aria-hidden="true" style={{"display": "block"}}><defs><linearGradient id="sxg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style={{"stopColor": "#F3D27A"}}></stop><stop offset="1" style={{"stopColor": "#C8962F"}}></stop></linearGradient></defs><path fill="url(#sxg)" d="M16,0 L49.4,0 L49,1.6 L36.4,19.6 L48.8,40.3 Q49.2,41.8 47.7,41.8 L32.8,41.8 Q30.6,41.7 31.4,40.4 L33.4,37.7 Q34,37.1 35,37.1 L38.3,37.1 L28.2,19.8 L21.8,11.2 Q21.1,9.2 23,9.1 L27,9.2 L32,15.9 L38.9,8.2 L40.3,5.8 Q40.5,5 39.4,5 L16.4,5 Q13.6,5.4 13.9,8.4 L14.3,10.3 L22.4,20.1 C28.5,26 29.5,31 27.6,35.8 C26.1,39.4 23.5,41.6 20.2,41.7 L1.4,41.8 Q0,41.7 0.4,40.2 L1.6,37.6 L6.4,30.9 L10.3,30.9 Q11.2,31.3 10.8,32.2 L9.2,35.4 Q9,36.8 10.3,36.8 L19.8,36.6 C22.8,35.5 23.6,32 21.9,29 L9.3,14.4 C7.6,12 7.4,6.5 9.5,3.5 C11,1.5 13,0.3 16,0 Z" /></svg>
<span style={{"display": "flex", "flexDirection": "column", "alignItems": "stretch"}}><span style={{"fontFamily": "Montserrat, Manrope, sans-serif", "fontWeight": "700", "fontSize": "20px", "letterSpacing": ".2em", "paddingLeft": ".2em", "whiteSpace": "nowrap", "background": "linear-gradient(180deg, #F3D27A, #C8962F)", "WebkitBackgroundClip": "text", "backgroundClip": "text", "color": "transparent"}}>SIXXAB</span><span style={{"display": "flex", "alignItems": "center", "gap": "7px", "marginTop": "5px", "fontFamily": "Montserrat, Manrope, sans-serif", "fontWeight": "600", "fontSize": "10px", "letterSpacing": ".34em", "paddingLeft": ".34em", "color": "#E0B95A", "whiteSpace": "nowrap"}}><i style={{"flex": "1", "height": "1.5px", "minWidth": "10px", "background": "#C8962F", "display": "block"}}></i>AI<i style={{"flex": "1", "height": "1.5px", "minWidth": "10px", "background": "#C8962F", "display": "block"}}></i></span></span>
</a>
<div className="navlinks" style={{"alignItems": "center", "gap": "30px", "fontSize": "14px", "fontVariationSettings": "'wght' 506"}}>
<a href="#outcomes">What you get</a>
<a href="#how">How it works</a>
<a href="#pricing">Pricing</a>
<a href="/investors">Investors</a>
</div>
<div className="navlinks" style={{"alignItems": "center", "gap": "24px", "fontSize": "14px", "fontVariationSettings": "'wght' 506"}}>
<a href="/login?next=start" style={{"color": "#E7C766", "fontVariationSettings": "'wght' 581"}}>Start your business</a>
<a href="/login">Log in</a>
<a href="#begin" style={{"display": "inline-flex", "alignItems": "center", "justifyContent": "center", "minHeight": "44px", "padding": "10px 22px", "boxSizing": "border-box", "borderRadius": "999px", "fontSize": "15px", "fontVariationSettings": "'wght' 540", "border": "1.6px solid rgba(255,255,255,.6)", "background": "transparent", "color": "#F3EBD8"}}>Book a strategy call</a>
</div>
<button type="button" className="burger" aria-label="Menu" aria-expanded={v.menuOpen} onClick={v.toggleMenu} style={{"width": "48px", "height": "44px", "alignItems": "center", "justifyContent": "center", "borderRadius": "999px", "border": "1.6px solid rgba(201,162,39,.72)", "background": "rgba(255,255,255,.04)", "color": "#F3EBD8", "cursor": "pointer"}}>
<svg viewBox="0 0 22 14" width="20" height="14" aria-hidden="true" style={{"fill": "none", "stroke": "currentColor", "strokeWidth": "1.5", "strokeLinecap": "round"}}><path d="M1 1 H21" /><path d="M1 7 H21" /><path d="M1 13 H21" /></svg>
</button>
</nav>
{v.menuOpen ? (<>
<div style={{"position": "absolute", "zIndex": "6", "top": "96px", "right": "22px", "width": "min(300px, 82vw)", "padding": "14px", "borderRadius": "22px", "display": "flex", "flexDirection": "column", "gap": "2px", "background": "linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.045)), linear-gradient(180deg, rgba(7,20,38,.72), rgba(7,20,38,.82))", "backdropFilter": "blur(26px)", "boxShadow": "0 14px 38px rgba(4,12,24,.45)"}}>
<a href="/login?next=start" style={{"padding": "13px 14px", "minHeight": "44px", "boxSizing": "border-box", "fontSize": "16px", "color": "#E7C766"}}>Start your business</a>
<a href="#outcomes" style={{"padding": "13px 14px", "minHeight": "44px", "boxSizing": "border-box", "fontSize": "16px"}}>What you get</a>
<a href="#how" style={{"padding": "13px 14px", "minHeight": "44px", "boxSizing": "border-box", "fontSize": "16px"}}>How it works</a>
<a href="#pricing" style={{"padding": "13px 14px", "minHeight": "44px", "boxSizing": "border-box", "fontSize": "16px"}}>Pricing</a>
<a href="mailto:sunil.kattikar@gmail.com?subject=SIXXAB%20consultant%20certification" style={{"padding": "13px 14px", "minHeight": "44px", "boxSizing": "border-box", "fontSize": "16px"}}>Consultants</a>
<a href="/investors" style={{"padding": "13px 14px", "minHeight": "44px", "boxSizing": "border-box", "fontSize": "16px"}}>Investors</a>
<a href="/login" style={{"padding": "13px 14px", "minHeight": "44px", "boxSizing": "border-box", "fontSize": "16px"}}>Log in</a>
<a href="#begin" style={{"marginTop": "8px", "padding": "13px 18px", "textAlign": "center", "border": "1.6px solid rgba(201,162,39,.72)", "borderRadius": "999px", "fontSize": "16px"}}>Book a strategy call</a>
</div>
</>) : null}
<div style={{"position": "relative", "zIndex": "1", "flex": "1", "display": "flex", "flexDirection": "column", "justifyContent": "center", "padding": "0 clamp(22px, 8vw, 120px)"}}>
<div style={{"width": "100%", "maxWidth": "1120px", "margin": "0 auto", "display": "flex", "flexDirection": "column", "gap": "22px"}}>
<p style={{"margin": "0", "fontSize": "14px", "letterSpacing": "3px", "textTransform": "uppercase", "color": "#E7C766", "fontVariationSettings": "'wght' 534"}}>Start it · Scale it · Run it</p>
<h1 className="h1" style={{"margin": "0", "fontSize": "clamp(32px, 3.9vw, 56px)", "lineHeight": "1.12", "fontWeight": "400", "fontVariationSettings": "'wght' 424", "letterSpacing": "-.01em"}}>The AI team that runs your business.</h1>
<p style={{"margin": "0", "maxWidth": "54ch", "fontSize": "clamp(17px, 1.45vw, 21px)", "lineHeight": "1.55", "color": "#F3EBD8"}}>Marketing, sales, operations and finance agents plan the work and do it every day, from your first customer to a $10M month.</p>
<p style={{"margin": "0", "maxWidth": "54ch", "fontSize": "clamp(15px, 1.2vw, 17px)", "lineHeight": "1.6", "color": "#9fb0c8"}}>You stay in charge: nothing reaches a customer or spends money without your approval.</p>
<div style={{"display": "flex", "flexWrap": "wrap", "gap": "12px", "marginTop": "6px"}}>
<a href="/login?next=start" style={{"display": "inline-flex", "alignItems": "center", "justifyContent": "center", "minHeight": "44px", "padding": "10px 22px", "boxSizing": "border-box", "borderRadius": "999px", "fontSize": "15px", "fontVariationSettings": "'wght' 540", "border": "1.6px solid #F3EBD8", "background": "linear-gradient(180deg, #E7C766, #C9A227)", "color": "#1a1405"}}>Start your business</a>
<a href="#begin" style={{"display": "inline-flex", "alignItems": "center", "justifyContent": "center", "minHeight": "44px", "padding": "10px 22px", "boxSizing": "border-box", "borderRadius": "999px", "fontSize": "15px", "fontVariationSettings": "'wght' 540", "border": "1.6px solid rgba(255,255,255,.6)", "background": "transparent", "color": "#F3EBD8"}}>Book a strategy call</a>
</div>
<p style={{"margin": "8px 0 0", "fontSize": "14px", "color": "#9fb0c8"}}>Live with businesses in the US and India · Human approval built in · 12-month plans</p>
</div>
</div>
</header>
<section id="outcomes" className="sec" style={{"padding": "96px clamp(22px, 8vw, 120px)", "borderTop": "1px solid rgba(201,162,39,.1)"}}>
<div style={{"maxWidth": "1120px", "margin": "0 auto"}}>
<p style={{"margin": "0 0 16px", "fontSize": "13px", "letterSpacing": "3px", "textTransform": "uppercase", "color": "#E7C766", "fontVariationSettings": "'wght' 534"}}>What you get</p>
<h2 className="h2" style={{"margin": "0 0 18px", "fontSize": "40px", "lineHeight": "1.15", "fontWeight": "400", "fontVariationSettings": "'wght' 430", "maxWidth": "26ch"}}>The team you need, without the payroll.</h2>
<div className="g3" style={{"display": "grid", "gridTemplateColumns": "repeat(3, minmax(0, 1fr))", "gap": "16px", "marginTop": "36px"}}>
{(v.outcomes || []).map((c, $index) => (<React.Fragment key={$index}>
<div style={{"padding": "28px", "borderRadius": "22px", "border": "1px solid rgba(201,162,39,.16)", "background": "rgba(255,255,255,.03)", "display": "flex", "flexDirection": "column", "gap": "10px"}}>
<span style={{"fontSize": "12px", "letterSpacing": "1.5px", "textTransform": "uppercase", "color": c.color, "fontVariationSettings": "'wght' 560"}}>{c.tag}</span>
<h3 style={{"margin": "0", "fontSize": "20px", "lineHeight": "1.3", "fontWeight": "400", "fontVariationSettings": "'wght' 540"}}>{c.title}</h3>
<p style={{"margin": "0", "fontSize": "15px", "lineHeight": "1.6", "color": "#9fb0c8"}}>{c.body}</p>
</div>
</React.Fragment>))}
</div>
</div>
</section>
<section id="paths" className="sec" style={{"padding": "96px clamp(22px, 8vw, 120px)", "borderTop": "1px solid rgba(201,162,39,.1)"}}>
<div style={{"maxWidth": "1120px", "margin": "0 auto"}}>
<p style={{"margin": "0 0 16px", "fontSize": "13px", "letterSpacing": "3px", "textTransform": "uppercase", "color": "#E7C766", "fontVariationSettings": "'wght' 534"}}>Your path</p>
<h2 className="h2" style={{"margin": "0 0 18px", "fontSize": "40px", "lineHeight": "1.15", "fontWeight": "400", "fontVariationSettings": "'wght' 430", "maxWidth": "26ch"}}>Wherever your business is, start there.</h2>
<p style={{"margin": "0", "maxWidth": "58ch", "fontSize": "18px", "lineHeight": "1.6", "color": "#9fb0c8"}}>The right agents switch on at each stage, from the first customer to a $10M month, and every milestone is tracked.</p>
<div className="g3" style={{"display": "grid", "gridTemplateColumns": "repeat(3, minmax(0, 1fr))", "gap": "16px", "marginTop": "36px"}}>
{(v.heads || []).map((h, $index) => (<React.Fragment key={$index}>
<a href={h.href} style={{"padding": "28px", "borderRadius": "22px", "border": `1px solid ${h.border}`, "background": "rgba(255,255,255,.03)", "display": "flex", "flexDirection": "column", "gap": "10px", "color": "#F3EBD8"}}>
<span style={{"fontSize": "12px", "letterSpacing": "1.5px", "textTransform": "uppercase", "color": h.color, "fontVariationSettings": "'wght' 560"}}>{h.stages}</span>
<span style={{"fontSize": "20px", "lineHeight": "1.3", "fontVariationSettings": "'wght' 540"}}>{h.name}</span>
<span style={{"fontSize": "15px", "lineHeight": "1.6", "color": "#9fb0c8"}}>{h.promise}</span>
<span style={{"marginTop": "auto", "paddingTop": "8px", "display": "inline-flex", "alignItems": "center", "gap": "10px", "fontSize": "15px"}}>{h.cta} <svg viewBox="0 0 16 11" width="14" height="10" aria-hidden="true" style={{"fill": "none", "stroke": "currentColor", "strokeWidth": "1.6"}}><path d="M0 5.5 H14.6 M10.3 1.2 L14.9 5.5 L10.3 9.8" /></svg></span>
</a>
</React.Fragment>))}
</div>
</div>
</section>
<section id="how" className="sec" style={{"padding": "96px clamp(22px, 8vw, 120px)", "borderTop": "1px solid rgba(201,162,39,.1)"}}>
<div style={{"maxWidth": "1120px", "margin": "0 auto"}}>
<p style={{"margin": "0 0 16px", "fontSize": "13px", "letterSpacing": "3px", "textTransform": "uppercase", "color": "#E7C766", "fontVariationSettings": "'wght' 534"}}>How it works</p>
<h2 className="h2" style={{"margin": "0 0 18px", "fontSize": "40px", "lineHeight": "1.15", "fontWeight": "400", "fontVariationSettings": "'wght' 430", "maxWidth": "26ch"}}>Agents do the work. You make the calls.</h2>
<ol className="g4" style={{"listStyle": "none", "margin": "36px 0 0", "padding": "0", "display": "grid", "gridTemplateColumns": "repeat(4, minmax(0, 1fr))", "gap": "16px"}}>
{(v.steps || []).map((st, $index) => (<React.Fragment key={$index}>
<li style={{"padding": "28px", "borderRadius": "22px", "border": "1px solid rgba(201,162,39,.16)", "background": "rgba(255,255,255,.03)", "display": "flex", "flexDirection": "column", "gap": "10px"}}>
<span style={{"fontSize": "32px", "lineHeight": "1", "color": "#E7C766", "fontVariationSettings": "'wght' 260"}}>{st.n}</span>
<h3 style={{"margin": "0", "fontSize": "18px", "lineHeight": "1.3", "fontWeight": "400", "fontVariationSettings": "'wght' 540"}}>{st.k}</h3>
<p style={{"margin": "0", "fontSize": "15px", "lineHeight": "1.6", "color": "#9fb0c8"}}>{st.v}</p>
</li>
</React.Fragment>))}
</ol>
<p style={{"margin": "24px 0 0", "fontSize": "15px", "lineHeight": "1.6", "color": "#9fb0c8"}}>Autonomy is earned: each kind of task runs on its own only after you have approved enough of its work.</p>
</div>
</section>
<section id="proof" className="sec" style={{"padding": "96px clamp(22px, 8vw, 120px)", "borderTop": "1px solid rgba(201,162,39,.1)"}}>
<div className="split" style={{"maxWidth": "1120px", "margin": "0 auto", "display": "grid", "gridTemplateColumns": "minmax(0, 1.2fr) minmax(0, 1fr)", "gap": "40px", "alignItems": "start"}}>
<div>
<p style={{"margin": "0 0 16px", "fontSize": "13px", "letterSpacing": "3px", "textTransform": "uppercase", "color": "#E7C766", "fontVariationSettings": "'wght' 534"}}>Built for real businesses</p>
<h2 className="h2" style={{"margin": "0 0 18px", "fontSize": "40px", "lineHeight": "1.15", "fontWeight": "400", "fontVariationSettings": "'wght' 430", "maxWidth": "26ch"}}>Running today, with you in control.</h2>
<ul style={{"listStyle": "none", "margin": "28px 0 0", "padding": "0", "display": "flex", "flexDirection": "column", "gap": "12px"}}>
{(v.proof || []).map((pf, $index) => (<React.Fragment key={$index}>
<li style={{"display": "flex", "gap": "12px", "alignItems": "baseline", "fontSize": "16px", "lineHeight": "1.5", "color": "#F3EBD8"}}><svg viewBox="0 0 14 11" width="12" height="10" aria-hidden="true" style={{"flex": "none", "fill": "none", "stroke": "#E7C766", "strokeWidth": "1.8", "strokeLinecap": "round", "strokeLinejoin": "round"}}><path d="M1 5.5 L5 9.5 L13 1.5" /></svg>{pf}</li>
</React.Fragment>))}
</ul>
</div>
<div style={{"padding": "28px", "borderRadius": "22px", "border": "1px solid rgba(201,162,39,.16)", "background": "rgba(255,255,255,.03)", "display": "flex", "flexDirection": "column", "gap": "10px"}}>
<span style={{"fontSize": "12px", "letterSpacing": "1.5px", "textTransform": "uppercase", "color": "#C9A227", "fontVariationSettings": "'wght' 560"}}>Also from SIXXAB</span>
<h3 style={{"margin": "0", "fontSize": "20px", "lineHeight": "1.3", "fontWeight": "400", "fontVariationSettings": "'wght' 540"}}>AI marketing agency and consultant certification</h3>
<p style={{"margin": "0", "fontSize": "15px", "lineHeight": "1.6", "color": "#9fb0c8"}}>Hand your marketing to 50 agents you approve, or become a certified SIXXAB consultant and deliver the platform to clients in your country.</p>
<a href="mailto:sunil.kattikar@gmail.com?subject=SIXXAB%20consultant%20certification" style={{"marginTop": "6px", "fontSize": "15px", "color": "#C9A227"}}>Ask about certification</a>
</div>
</div>
</section>
<section id="pricing" className="sec" style={{"padding": "96px clamp(22px, 8vw, 120px)", "borderTop": "1px solid rgba(201,162,39,.1)"}}>
<div style={{"maxWidth": "1120px", "margin": "0 auto"}}>
<p style={{"margin": "0 0 16px", "fontSize": "13px", "letterSpacing": "3px", "textTransform": "uppercase", "color": "#E7C766", "fontVariationSettings": "'wght' 534"}}>Pricing</p>
<h2 className="h2" style={{"margin": "0 0 18px", "fontSize": "40px", "lineHeight": "1.15", "fontWeight": "400", "fontVariationSettings": "'wght' 430", "maxWidth": "26ch"}}>One plan for each stage.</h2>
<p style={{"margin": "0", "maxWidth": "58ch", "fontSize": "18px", "lineHeight": "1.6", "color": "#9fb0c8"}}>A whole AI-run business for less than one senior hire. Every plan is a 12-month contract.</p>
<div className="g3" style={{"display": "grid", "gridTemplateColumns": "repeat(3, minmax(0, 1fr))", "gap": "16px", "marginTop": "36px"}}>
{(v.plans || []).map((p, $index) => (<React.Fragment key={$index}>
<div style={{"padding": "30px", "borderRadius": "22px", "border": `1px solid ${p.border}`, "background": p.bg, "display": "flex", "flexDirection": "column", "gap": "14px"}}>
<span style={{"fontSize": "12px", "letterSpacing": "1.5px", "textTransform": "uppercase", "color": p.color, "fontVariationSettings": "'wght' 560"}}>{p.who}</span>
<h3 style={{"margin": "0", "fontSize": "22px", "fontWeight": "400", "fontVariationSettings": "'wght' 520"}}>{p.name}</h3>
<span style={{"fontSize": "36px", "lineHeight": "1.1", "fontVariationSettings": "'wght' 360"}}>{p.price}<span style={{"fontSize": "15px", "color": "#9fb0c8"}}> / month, from</span></span>
<ul style={{"listStyle": "none", "margin": "0", "padding": "14px 0 0", "borderTop": "1px solid rgba(201,162,39,.12)", "display": "flex", "flexDirection": "column", "gap": "10px"}}>
{(p.features || []).map((ft, $index) => (<React.Fragment key={$index}>
<li style={{"display": "flex", "gap": "10px", "alignItems": "baseline", "fontSize": "14px", "lineHeight": "1.5", "color": "#F3EBD8"}}><svg viewBox="0 0 14 11" width="12" height="10" aria-hidden="true" style={{"flex": "none", "fill": "none", "stroke": "#E7C766", "strokeWidth": "1.8", "strokeLinecap": "round", "strokeLinejoin": "round"}}><path d="M1 5.5 L5 9.5 L13 1.5" /></svg>{ft}</li>
</React.Fragment>))}
</ul>
<a href={p.href} style={{"marginTop": "auto", "display": "flex", "alignItems": "center", "justifyContent": "center", "minHeight": "44px", "padding": "10px 22px", "boxSizing": "border-box", "borderRadius": "999px", "fontSize": "15px", "fontVariationSettings": "'wght' 540", "border": `1.6px solid ${p.btn}`, "background": p.btnBg, "color": p.btnInk}}>{p.cta}</a>
</div>
</React.Fragment>))}
</div>
</div>
</section>
<section id="begin" className="sec" style={{"padding": "96px clamp(22px, 8vw, 120px)", "borderTop": "1px solid rgba(201,162,39,.1)"}}>
<div style={{"maxWidth": "1120px", "margin": "0 auto"}}>
<div style={{"padding": "28px", "borderRadius": "22px", "border": "1px solid rgba(201,162,39,.16)", "background": "rgba(255,255,255,.03)", "display": "flex", "flexDirection": "column", "gap": "14px"}}>
<p style={{"margin": "0", "fontSize": "12px", "letterSpacing": "1.5px", "textTransform": "uppercase", "color": "#E7C766", "fontVariationSettings": "'wght' 560"}}>Strategy call</p>
<h2 className="h2" style={{"margin": "0", "fontSize": "28px", "lineHeight": "1.25", "fontWeight": "400", "fontVariationSettings": "'wght' 480"}}>Hire the co-founder that never sleeps.</h2>
<p style={{"margin": "0", "maxWidth": "60ch", "fontSize": "15px", "lineHeight": "1.6", "color": "#9fb0c8"}}>Book 30 minutes with Sunil Kattikar, founder of SIXXAB AI. Leave with where your business stands, the plan that fits, and your first 90 days with AI agents.</p>
<div style={{"display": "flex", "flexWrap": "wrap", "gap": "12px"}}>
<a href={v.bookHref} target="_blank" rel="noopener" style={{"display": "inline-flex", "alignItems": "center", "justifyContent": "center", "minHeight": "44px", "padding": "10px 22px", "boxSizing": "border-box", "borderRadius": "999px", "fontSize": "15px", "fontVariationSettings": "'wght' 540", "border": "1.6px solid #F3EBD8", "background": "linear-gradient(180deg, #E7C766, #C9A227)", "color": "#1a1405"}}>Choose a time</a>
<a href="mailto:sunil.kattikar@gmail.com?subject=SIXXAB%20AI%20strategy%20call&body=Business%3A%0AStage%3A%0AWhat%20I%20want%20to%20fix%3A%0A" style={{"display": "inline-flex", "alignItems": "center", "justifyContent": "center", "minHeight": "44px", "padding": "10px 22px", "boxSizing": "border-box", "borderRadius": "999px", "fontSize": "15px", "fontVariationSettings": "'wght' 540", "border": "1.6px solid rgba(255,255,255,.6)", "background": "transparent", "color": "#F3EBD8"}}>Email Sunil</a>
<a href="/login?next=start" style={{"display": "inline-flex", "alignItems": "center", "justifyContent": "center", "minHeight": "44px", "padding": "10px 22px", "boxSizing": "border-box", "borderRadius": "999px", "fontSize": "15px", "fontVariationSettings": "'wght' 540", "border": "1.6px solid rgba(255,255,255,.6)", "background": "transparent", "color": "#F3EBD8"}}>Start your business</a>
</div>
</div>
</div>
</section>
<footer style={{"padding": "36px clamp(22px, 8vw, 120px)", "borderTop": "1px solid rgba(201,162,39,.12)", "display": "flex", "flexWrap": "wrap", "alignItems": "center", "justifyContent": "space-between", "gap": "16px", "fontSize": "14px", "color": "#9fb0c8"}}>
<span>© 2026 SIXXAB AI · sixxab.ai</span>
<span style={{"display": "flex", "flexWrap": "wrap", "gap": "24px"}}><a href="/investors">Investors</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="mailto:sunil.kattikar@gmail.com">Contact</a></span>
</footer>
</div>
</>);
}
