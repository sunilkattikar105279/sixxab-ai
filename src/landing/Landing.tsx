// @ts-nocheck
// Generated from the approved design artboard by scripts/convert-dc.mjs. Do not hand-edit layout here.
import React from 'react';
import { useDC } from './dc.js';
import { Component } from './logic.js';

export default function Landing(props) {
  const v = useDC(Component, props);
  return (<>
<div style={{"width": "100%", "minWidth": "0", "background": "#02060f", "color": "#ffffff", "fontFamily": "'Sora', system-ui, sans-serif"}}>
<header style={{"position": "relative", "height": "100vh", "minHeight": "780px", "maxHeight": "1100px", "overflow": "hidden", "display": "flex", "flexDirection": "column"}}>
<div aria-hidden="true" style={{"position": "absolute", "inset": "0", "background": "radial-gradient(circle at 50% 47%, #ffffff 0%, #fff1d8 1.2%, rgba(255,214,150,.55) 5%, rgba(255,190,110,.16) 16%, rgba(2,6,15,0) 34%), conic-gradient(from 225deg at 50% 47%, rgba(255,196,110,.28) 0deg, rgba(2,6,15,0) 40deg, rgba(2,6,15,0) 50deg, rgba(120,170,240,.24) 90deg, rgba(2,6,15,0) 135deg, rgba(2,6,15,0) 180deg, rgba(120,170,240,.24) 225deg, rgba(2,6,15,0) 270deg, rgba(2,6,15,0) 310deg, rgba(255,196,110,.28) 360deg), radial-gradient(120% 60% at 50% 100%, #0b1a3a 0%, #03070f 70%)"}}></div>
{v.showVideo ? (<>
<video autoPlay muted loop playsInline preload="auto" aria-hidden="true" poster="https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/130837c4-0244-4f37-9c61-8d801d93fd29.jpg" src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260912_104303_0c6d60b2-9353-408e-9449-585108a22fb5.mp4" style={{"position": "absolute", "inset": "0", "width": "100%", "height": "100%", "objectFit": "cover", "pointerEvents": "none"}} />
</>) : null}
<div aria-hidden="true" style={{"position": "absolute", "inset": "0", "pointerEvents": "none", "background": v.veil}}></div>
<nav aria-label="Main" style={{"position": "relative", "zIndex": "5", "display": "flex", "alignItems": "center", "justifyContent": "space-between", "gap": "16px", "padding": "36px clamp(22px, 8vw, 120px) 0"}}>
<a href="/" className="l1" style={{"display": "flex", "alignItems": "center", "gap": "9px", "color": "#ffffff"}}>
<svg viewBox="0 0 23 17" width="24" height="18" aria-hidden="true" style={{"fill": "#ffffff", "display": "block"}}><path d="M8.15 0.9 L4.55 0.9 L0.5 9.3 L4.1 9.3 Z" /><path d="M17.0 0 L13.4 0 L6.15 16.4 L9.75 16.4 Z" /><path d="M22.9 0 L19.3 0 L15.0 7.6 L18.6 7.6 Z" /><path d="M22.6 6.9 L19.0 6.9 L14.05 16.4 L17.65 16.4 Z" /></svg>
<span style={{"fontSize": "21px", "letterSpacing": "4px", "fontVariationSettings": "'wght' 531"}}>SIXXAB</span><span style={{"fontSize": "21px", "letterSpacing": "2px", "color": "#ffe2b2", "fontVariationSettings": "'wght' 340"}}>AI</span>
</a>
<div className="navlinks l1" style={{"alignItems": "center", "gap": "30px", "fontSize": "14px", "fontVariationSettings": "'wght' 506"}}>
<a href="#paths">Your path</a>
<a href="#how">How it works</a>
<a href="#pricing">Pricing</a>
<a href="/investors">Investors</a>
</div>
<div className="navlinks l1" style={{"alignItems": "center", "gap": "24px", "fontSize": "14px", "fontVariationSettings": "'wght' 506"}}>
<a href="/login?next=start" style={{"color": "#ffe2b2", "fontVariationSettings": "'wght' 581"}}>Start your business</a>
<a href="/login">Log in</a>
<a href="#begin" style={{"padding": "12px 22px", "border": "1.6px solid rgba(196,214,232,.72)", "borderRadius": "999px", "color": "#e8ecf0", "fontVariationSettings": "'wght' 581"}}>Book a strategy call</a>
</div>
<button type="button" className="burger" aria-label="Menu" aria-expanded={v.menuOpen} onClick={v.toggleMenu} style={{"width": "48px", "height": "44px", "alignItems": "center", "justifyContent": "center", "borderRadius": "999px", "border": "1.6px solid rgba(196,214,232,.72)", "background": "rgba(255,255,255,.04)", "color": "#fbfdff", "cursor": "pointer"}}>
<svg viewBox="0 0 22 14" width="20" height="14" aria-hidden="true" style={{"fill": "none", "stroke": "currentColor", "strokeWidth": "1.5", "strokeLinecap": "round"}}><path d="M1 1 H21" /><path d="M1 7 H21" /><path d="M1 13 H21" /></svg>
</button>
</nav>
{v.menuOpen ? (<>
<div style={{"position": "absolute", "zIndex": "6", "top": "96px", "right": "22px", "width": "min(300px, 82vw)", "padding": "14px", "borderRadius": "22px", "display": "flex", "flexDirection": "column", "gap": "2px", "background": "linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.045)), linear-gradient(180deg, rgba(6,12,22,.72), rgba(6,12,22,.82))", "backdropFilter": "blur(26px)", "boxShadow": "0 14px 38px rgba(2,6,14,.45)"}}>
<a href="/login?next=start" style={{"padding": "13px 14px", "minHeight": "44px", "boxSizing": "border-box", "fontSize": "16px", "color": "#ffe2b2"}}>Start your business</a>
<a href="#paths" style={{"padding": "13px 14px", "minHeight": "44px", "boxSizing": "border-box", "fontSize": "16px"}}>Your path</a>
<a href="#how" style={{"padding": "13px 14px", "minHeight": "44px", "boxSizing": "border-box", "fontSize": "16px"}}>How it works</a>
<a href="#pricing" style={{"padding": "13px 14px", "minHeight": "44px", "boxSizing": "border-box", "fontSize": "16px"}}>Pricing</a>
<a href="/investors" style={{"padding": "13px 14px", "minHeight": "44px", "boxSizing": "border-box", "fontSize": "16px"}}>Investors</a>
<a href="/login" style={{"padding": "13px 14px", "minHeight": "44px", "boxSizing": "border-box", "fontSize": "16px"}}>Log in</a>
<a href="#begin" style={{"marginTop": "8px", "padding": "13px 18px", "textAlign": "center", "border": "1.6px solid rgba(196,214,232,.72)", "borderRadius": "999px", "fontSize": "16px"}}>Book a strategy call</a>
</div>
</>) : null}
<div style={{"position": "relative", "zIndex": "1", "flex": "1", "display": "flex", "flexDirection": "column", "alignItems": "center", "justifyContent": "center", "textAlign": "center", "gap": "22px", "padding": "0 24px"}}>
<p className="l1" style={{"margin": "0", "fontSize": "14px", "letterSpacing": "3px", "textTransform": "uppercase", "color": "#ffe2b2", "fontVariationSettings": "'wght' 534"}}>You're a founder. Or you should be.</p>
<h1 className="h1" style={{"margin": "0", "fontSize": "clamp(34px, 4.4vw, 64px)", "lineHeight": "1.12", "fontWeight": "400", "fontVariationSettings": "'wght' 424", "letterSpacing": "-.01em"}}>
<span className="w1" style={{"display": "block"}}>Start it. Scale it. Run it.</span>
<span className="w2" style={{"display": "block"}}>AI that runs your business.</span>
</h1>
<p className="l2" aria-live="polite" style={{"margin": "0", "display": "flex", "justifyContent": "center", "alignItems": "flex-start", "gap": ".32em", "fontSize": "clamp(20px, 2vw, 28px)", "lineHeight": "1.3", "fontVariationSettings": "'wght' 446"}}><span>SIXXAB AI</span><span style={{"display": "inline-block", "height": "1.3em", "overflow": "hidden", "textAlign": "left"}}><span style={{"display": "flex", "flexDirection": "column", "transform": v.tickerShift, "transition": v.tickerEase}}>{(v.lines || []).map((ln, $index) => (<React.Fragment key={$index}><span style={{"display": "block", "height": "1.3em", "whiteSpace": "nowrap", "color": "#ffe2b2"}}>{ln}</span></React.Fragment>))}</span></span></p>
<p className="l2" style={{"margin": "0", "maxWidth": "40ch", "fontSize": "clamp(15px, 1.3vw, 18px)", "lineHeight": "1.5", "color": "#a2a9b8"}}>Your first employee and your whole team, from the first idea to $10M. It never sleeps.</p>
<div className="l3" style={{"display": "flex", "flexWrap": "wrap", "justifyContent": "center", "gap": "12px"}}>
<a href="/login?next=start" style={{"display": "inline-flex", "alignItems": "center", "gap": "10px", "minHeight": "52px", "padding": "15px 28px", "borderRadius": "999px", "background": "#ffffff", "color": "#02060f", "fontSize": "17px", "fontVariationSettings": "'wght' 560"}}>Start your business</a>
<a href="#how" className="glass" style={{"display": "inline-flex", "alignItems": "center", "gap": "10px", "minHeight": "52px", "padding": "15px 26px", "borderRadius": "999px", "fontSize": "17px", "color": "#ffffff", "fontVariationSettings": "'wght' 497"}}>See how it works</a>
</div>
</div>
<p className="l4" style={{"position": "relative", "zIndex": "1", "margin": "0", "padding": "0 24px 44px", "textAlign": "center", "fontSize": "16px", "color": "#f4f8fd", "fontVariationSettings": "'wght' 521"}}>The solo founder's standing army.</p>
</header>
<section id="paths" className="sec" style={{"padding": "120px clamp(22px, 8vw, 120px) 100px", "maxWidth": "1440px", "margin": "0 auto", "boxSizing": "border-box"}}>
<p style={{"margin": "0 0 16px", "fontSize": "13px", "letterSpacing": "3px", "textTransform": "uppercase", "color": "#ffe2b2", "fontVariationSettings": "'wght' 534"}}>Three paths. Six stages. One platform.</p>
<h2 className="h2" style={{"margin": "0 0 18px", "fontSize": "44px", "lineHeight": "1.15", "fontWeight": "400", "fontVariationSettings": "'wght' 424", "maxWidth": "24ch"}}>Wherever your business is, SIXXAB meets it there.</h2>
<p style={{"margin": "0 0 56px", "maxWidth": "56ch", "fontSize": "18px", "lineHeight": "1.55", "color": "#a2a9b8"}}>Six stages from $0 to $10M. The right agents switch on at each one, and every milestone is tracked.</p>
<div className="track" aria-hidden="true" style={{"display": "grid", "gridTemplateColumns": "repeat(6, minmax(0, 1fr))", "gap": "6px", "marginBottom": "14px"}}>
{(v.stages || []).map((s, $index) => (<React.Fragment key={$index}>
<div style={{"display": "flex", "flexDirection": "column", "gap": "8px"}}>
<span style={{"height": "4px", "borderRadius": "4px", "background": s.bar}}></span>
<span style={{"fontSize": "13px", "color": "#e2ebf5", "fontVariationSettings": "'wght' 540"}}>{s.name} <span style={{"color": "#8d96a8", "fontVariationSettings": "'wght' 400"}}>{s.money}</span></span>
</div>
</React.Fragment>))}
</div>
<div className="g3" style={{"display": "grid", "gridTemplateColumns": "repeat(3, minmax(0, 1fr))", "gap": "20px"}}>
{(v.heads || []).map((h, $index) => (<React.Fragment key={$index}>
<a href={h.href} style={{"padding": "34px", "borderRadius": "24px", "border": `1px solid ${h.border}`, "background": h.bg, "display": "flex", "flexDirection": "column", "gap": "14px", "color": "#ffffff"}}>
<span style={{"fontSize": "40px", "color": h.color, "fontVariationSettings": "'wght' 200"}}>{h.n}</span>
<span style={{"fontSize": "26px", "lineHeight": "1.2", "fontVariationSettings": "'wght' 480"}}>{h.name}</span>
<span style={{"fontSize": "13px", "color": h.color, "fontVariationSettings": "'wght' 540"}}>{h.stages}</span>
<span style={{"fontSize": "15px", "lineHeight": "1.6", "color": "#a2a9b8"}}>{h.promise}</span>
<span style={{"marginTop": "auto", "paddingTop": "10px", "display": "inline-flex", "alignItems": "center", "gap": "10px", "fontSize": "15px", "color": "#ffffff"}}>{h.cta}
<svg viewBox="0 0 16 11" width="14" height="10" aria-hidden="true" style={{"fill": "none", "stroke": "currentColor", "strokeWidth": "1.6"}}><path d="M0 5.5 H14.6 M10.3 1.2 L14.9 5.5 L10.3 9.8" /></svg></span>
</a>
</React.Fragment>))}
</div>
</section>
<section id="how" className="sec" style={{"padding": "110px clamp(22px, 8vw, 120px)", "background": "radial-gradient(60% 50% at 50% 0%, rgba(40,70,140,.22), rgba(2,6,15,0) 70%)"}}>
<div style={{"maxWidth": "1240px", "margin": "0 auto"}}>
<p style={{"margin": "0 0 16px", "fontSize": "13px", "letterSpacing": "3px", "textTransform": "uppercase", "color": "#ffe2b2", "fontVariationSettings": "'wght' 534"}}>How it works</p>
<h2 className="h2" style={{"margin": "0 0 18px", "fontSize": "44px", "lineHeight": "1.15", "fontWeight": "400", "fontVariationSettings": "'wght' 424", "maxWidth": "24ch"}}>Agents do the work. You make the calls.</h2>
<p style={{"margin": "0 0 48px", "maxWidth": "56ch", "fontSize": "18px", "lineHeight": "1.55", "color": "#a2a9b8"}}>One founder agent sets the plan, executive agents turn it into work, and nothing reaches a customer or spends money without your yes.</p>
<div className="g4" style={{"display": "grid", "gridTemplateColumns": "repeat(4, minmax(0, 1fr))", "gap": "14px", "marginBottom": "28px"}}>
{(v.layers || []).map((l, $index) => (<React.Fragment key={$index}>
<div style={{"padding": "24px", "borderRadius": "20px", "border": `1px solid ${l.border}`, "background": "rgba(255,255,255,.03)", "display": "flex", "flexDirection": "column", "gap": "6px"}}>
<span style={{"fontSize": "40px", "lineHeight": "1", "color": l.color, "fontVariationSettings": "'wght' 260"}}>{l.count}</span>
<span style={{"fontSize": "16px", "fontVariationSettings": "'wght' 520"}}>{l.name}</span>
</div>
</React.Fragment>))}
</div>
<div className="split" style={{"display": "grid", "gridTemplateColumns": "minmax(0, 1.25fr) minmax(0, 1fr)", "gap": "20px"}}>
<div style={{"padding": "34px", "borderRadius": "26px", "border": "1px solid rgba(255,226,178,.25)", "background": "rgba(255,226,178,.03)", "display": "flex", "flexDirection": "column", "gap": "18px"}}>
<span style={{"fontSize": "12px", "letterSpacing": "2px", "textTransform": "uppercase", "color": "#ffe2b2", "fontVariationSettings": "'wght' 560"}}>The loop</span>
<h3 style={{"margin": "0", "fontSize": "26px", "lineHeight": "1.25", "fontWeight": "400", "fontVariationSettings": "'wght' 480"}}>Humans in the loop. Learning in every loop.</h3>
<ol className="g3" style={{"listStyle": "none", "margin": "0", "padding": "0", "display": "grid", "gridTemplateColumns": "repeat(3, minmax(0, 1fr))", "gap": "10px"}}>
{(v.loopSteps || []).map((ls, $index) => (<React.Fragment key={$index}>
<li style={{"padding": "16px", "borderRadius": "16px", "border": `1px solid ${ls.border}`, "background": ls.bg, "display": "flex", "flexDirection": "column", "gap": "6px"}}>
<span style={{"fontSize": "12px", "color": ls.color, "fontVariationSettings": "'wght' 560"}}>{ls.n} · {ls.who}</span>
<span style={{"fontSize": "16px", "fontVariationSettings": "'wght' 540"}}>{ls.k}</span>
</li>
</React.Fragment>))}
</ol>
</div>
<div style={{"padding": "34px", "borderRadius": "26px", "border": "1px solid rgba(150,196,244,.3)", "background": "rgba(150,196,244,.035)", "display": "flex", "flexDirection": "column", "gap": "18px"}}>
<span style={{"fontSize": "12px", "letterSpacing": "2px", "textTransform": "uppercase", "color": "#96c4f4", "fontVariationSettings": "'wght' 560"}}>Autonomy is earned</span>
<h3 style={{"margin": "0", "fontSize": "26px", "lineHeight": "1.25", "fontWeight": "400", "fontVariationSettings": "'wght' 480"}}>Each task earns its freedom.</h3>
<ol style={{"listStyle": "none", "margin": "0", "padding": "0", "display": "flex", "flexDirection": "column", "gap": "10px"}}>
{(v.autonomy || []).map((au, $index) => (<React.Fragment key={$index}>
<li style={{"padding": "16px 18px", "borderRadius": "16px", "border": `1px solid ${au.border}`, "background": au.bg, "display": "flex", "gap": "14px", "alignItems": "center"}}>
<span style={{"flex": "none", "width": "38px", "height": "38px", "borderRadius": "12px", "display": "inline-flex", "alignItems": "center", "justifyContent": "center", "fontSize": "14px", "color": "#02060f", "background": au.color, "fontVariationSettings": "'wght' 640"}}>L{au.n}</span>
<span style={{"display": "flex", "flexDirection": "column", "gap": "2px"}}><span style={{"fontSize": "16px", "fontVariationSettings": "'wght' 540"}}>{au.k}</span><span style={{"fontSize": "14px", "lineHeight": "1.45", "color": "#a2a9b8"}}>{au.v}</span></span>
</li>
</React.Fragment>))}
</ol>
</div>
</div>
</div>
</section>
<section id="more" className="sec" style={{"padding": "100px clamp(22px, 8vw, 120px)"}}>
<div style={{"maxWidth": "1200px", "margin": "0 auto"}}>
<p style={{"margin": "0 0 16px", "fontSize": "13px", "letterSpacing": "3px", "textTransform": "uppercase", "color": "#ffe2b2", "fontVariationSettings": "'wght' 534"}}>More ways to work with SIXXAB</p>
<div className="g3" style={{"display": "grid", "gridTemplateColumns": "repeat(3, minmax(0, 1fr))", "gap": "16px"}}>
{(v.more || []).map((mo, $index) => (<React.Fragment key={$index}>
<a href={mo.href} style={{"padding": "28px", "borderRadius": "22px", "border": `1px solid ${mo.border}`, "background": "rgba(255,255,255,.03)", "display": "flex", "flexDirection": "column", "gap": "10px", "color": "#ffffff"}}>
<span style={{"fontSize": "12px", "letterSpacing": "1.5px", "textTransform": "uppercase", "color": mo.color, "fontVariationSettings": "'wght' 560"}}>{mo.tag}</span>
<span style={{"fontSize": "21px", "lineHeight": "1.25", "fontVariationSettings": "'wght' 500"}}>{mo.title}</span>
<span style={{"fontSize": "15px", "lineHeight": "1.55", "color": "#a2a9b8"}}>{mo.body}</span>
</a>
</React.Fragment>))}
</div>
</div>
</section>
<section id="pricing" className="sec" style={{"padding": "110px clamp(22px, 8vw, 120px)"}}>
<div style={{"maxWidth": "1200px", "margin": "0 auto", "textAlign": "center"}}>
<p style={{"margin": "0 0 16px", "fontSize": "13px", "letterSpacing": "3px", "textTransform": "uppercase", "color": "#ffe2b2", "fontVariationSettings": "'wght' 534"}}>Pricing</p>
<h2 className="h2" style={{"margin": "0 0 18px", "fontSize": "44px", "lineHeight": "1.15", "fontWeight": "400", "fontVariationSettings": "'wght' 424"}}>One plan for each path.</h2>
<p style={{"margin": "0 auto 52px", "maxWidth": "50ch", "fontSize": "18px", "lineHeight": "1.55", "color": "#a2a9b8"}}>A whole AI-run business for less than a small team. Every plan is a 12-month contract.</p>
<div className="g3" style={{"display": "grid", "gridTemplateColumns": "repeat(3, minmax(0, 1fr))", "gap": "20px", "textAlign": "left"}}>
{(v.plans || []).map((p, $index) => (<React.Fragment key={$index}>
<div style={{"padding": "36px", "borderRadius": "26px", "border": `1px solid ${p.border}`, "background": p.bg, "display": "flex", "flexDirection": "column", "gap": "16px"}}>
<span style={{"fontSize": "13px", "color": p.color, "fontVariationSettings": "'wght' 560"}}>Path {p.n} · {p.who}</span>
<h3 style={{"margin": "0", "fontSize": "26px", "fontWeight": "400", "fontVariationSettings": "'wght' 520"}}>{p.name}</h3>
<div style={{"display": "flex", "flexDirection": "column", "gap": "2px"}}>
<span style={{"fontSize": "13px", "color": "#8d96a8"}}>Starting at</span>
<span style={{"fontSize": "44px", "lineHeight": "1.1", "fontVariationSettings": "'wght' 340"}}>{p.price}<span style={{"fontSize": "15px", "color": "#a2a9b8"}}> / month</span></span>
<span style={{"fontSize": "13px", "color": "#a2a9b8"}}>USD · 12-month contract</span>
</div>
<p style={{"margin": "0", "fontSize": "15px", "lineHeight": "1.6", "color": "#c9d2de"}}>{p.body}</p>
<ul style={{"listStyle": "none", "margin": "0", "padding": "16px 0 0", "borderTop": "1px solid rgba(196,214,232,.12)", "display": "flex", "flexDirection": "column", "gap": "10px"}}>
{(p.features || []).map((ft, $index) => (<React.Fragment key={$index}>
<li style={{"display": "flex", "gap": "10px", "alignItems": "baseline", "fontSize": "14px", "lineHeight": "1.5", "color": "#e2ebf5"}}><svg viewBox="0 0 14 11" width="12" height="10" aria-hidden="true" style={{"flex": "none", "fill": "none", "stroke": p.color, "strokeWidth": "1.8", "strokeLinecap": "round", "strokeLinejoin": "round"}}><path d="M1 5.5 L5 9.5 L13 1.5" /></svg>{ft}</li>
</React.Fragment>))}
</ul>
<a href="#begin" style={{"marginTop": "auto", "padding": "15px 24px", "textAlign": "center", "borderRadius": "999px", "border": `1.6px solid ${p.btn}`, "background": p.btnBg, "color": p.btnInk, "fontSize": "16px", "fontVariationSettings": "'wght' 540"}}>{p.cta}</a>
</div>
</React.Fragment>))}
</div>
<p style={{"margin": "32px auto 0", "maxWidth": "64ch", "fontSize": "14px", "lineHeight": "1.6", "color": "#8d96a8"}}>Prices are starting points; your quote depends on scope, number of business units and markets. Human-in-the-loop approvals, the learning loop and the daily briefing come with every plan.</p>
</div>
</section>
<section id="begin" className="sec" style={{"padding": "130px 24px 120px", "textAlign": "center", "background": "radial-gradient(60% 70% at 50% 100%, rgba(255,200,120,.16), rgba(2,6,15,0) 70%)"}}>
<p style={{"margin": "0 0 16px", "fontSize": "13px", "letterSpacing": "3px", "textTransform": "uppercase", "color": "#ffe2b2", "fontVariationSettings": "'wght' 534"}}>Strategy call</p>
<h2 className="h2" style={{"margin": "0 auto 20px", "maxWidth": "18ch", "fontSize": "52px", "lineHeight": "1.1", "fontWeight": "400", "fontVariationSettings": "'wght' 424"}}>Stop waiting for a co-founder. Hire one that never sleeps.</h2>
<p style={{"margin": "0 auto 48px", "maxWidth": "46ch", "fontSize": "18px", "lineHeight": "1.55", "color": "#a2a9b8"}}>Book a strategy call with Sunil Kattikar, founder of SIXXAB AI. Tell us where your business is today, and leave with the path to start, scale or run it.</p>
<div className="split" style={{"maxWidth": "980px", "margin": "0 auto", "display": "grid", "gridTemplateColumns": "minmax(0, 1.2fr) minmax(0, 1fr)", "gap": "20px", "textAlign": "left"}}>
<div className="glass" style={{"padding": "34px", "borderRadius": "26px", "display": "flex", "flexDirection": "column", "gap": "18px"}}>
<div style={{"display": "flex", "alignItems": "center", "gap": "14px"}}>
<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" style={{"fill": "none", "stroke": "#ffe2b2", "strokeWidth": "1.6", "strokeLinecap": "round", "strokeLinejoin": "round"}}><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10 H21 M8 3 V7 M16 3 V7 M8 14 H10 M14 14 H16 M8 17.5 H10" /></svg>
<h3 style={{"margin": "0", "fontSize": "24px", "fontWeight": "400", "fontVariationSettings": "'wght' 500"}}>Book your strategy call</h3>
</div>
<p style={{"margin": "0", "fontSize": "15px", "lineHeight": "1.6", "color": "#c9d2de"}}>Pick a time that suits you on Google Calendar. You'll get a calendar invite with the video link straight away.</p>
<ul style={{"listStyle": "none", "margin": "0", "padding": "0", "display": "flex", "flexDirection": "column", "gap": "10px"}}>
<li style={{"display": "flex", "gap": "10px", "alignItems": "baseline", "fontSize": "15px", "color": "#e2ebf5"}}><svg viewBox="0 0 14 11" width="12" height="10" aria-hidden="true" style={{"flex": "none", "fill": "none", "stroke": "#ffe2b2", "strokeWidth": "1.8", "strokeLinecap": "round", "strokeLinejoin": "round"}}><path d="M1 5.5 L5 9.5 L13 1.5" /></svg>Where you are on the SIXXAB path today</li>
<li style={{"display": "flex", "gap": "10px", "alignItems": "baseline", "fontSize": "15px", "color": "#e2ebf5"}}><svg viewBox="0 0 14 11" width="12" height="10" aria-hidden="true" style={{"flex": "none", "fill": "none", "stroke": "#ffe2b2", "strokeWidth": "1.8", "strokeLinecap": "round", "strokeLinejoin": "round"}}><path d="M1 5.5 L5 9.5 L13 1.5" /></svg>Which path and plan fit your business</li>
<li style={{"display": "flex", "gap": "10px", "alignItems": "baseline", "fontSize": "15px", "color": "#e2ebf5"}}><svg viewBox="0 0 14 11" width="12" height="10" aria-hidden="true" style={{"flex": "none", "fill": "none", "stroke": "#ffe2b2", "strokeWidth": "1.8", "strokeLinecap": "round", "strokeLinejoin": "round"}}><path d="M1 5.5 L5 9.5 L13 1.5" /></svg>Your first 90 days with AI agents</li>
<li style={{"display": "flex", "gap": "10px", "alignItems": "baseline", "fontSize": "15px", "color": "#e2ebf5"}}><svg viewBox="0 0 14 11" width="12" height="10" aria-hidden="true" style={{"flex": "none", "fill": "none", "stroke": "#ffe2b2", "strokeWidth": "1.8", "strokeLinecap": "round", "strokeLinejoin": "round"}}><path d="M1 5.5 L5 9.5 L13 1.5" /></svg>Consultants: which certification tier suits you</li>
</ul>
<a href={v.bookHref} target="_blank" rel="noopener" style={{"marginTop": "6px", "display": "inline-flex", "alignItems": "center", "justifyContent": "center", "gap": "12px", "minHeight": "52px", "padding": "16px 28px", "borderRadius": "999px", "background": "#ffffff", "color": "#02060f", "fontSize": "17px", "fontVariationSettings": "'wght' 560"}}>Choose a time on Google Calendar
<svg viewBox="0 0 16 11" width="16" height="11" aria-hidden="true" style={{"fill": "none", "stroke": "#02060f", "strokeWidth": "1.6"}}><path d="M0 5.5 H14.6 M10.3 1.2 L14.9 5.5 L10.3 9.8" /></svg></a>
</div>
<div style={{"padding": "34px", "borderRadius": "26px", "border": "1px solid rgba(196,214,232,.2)", "background": "rgba(255,255,255,.03)", "display": "flex", "flexDirection": "column", "gap": "18px"}}>
<div style={{"display": "flex", "alignItems": "center", "gap": "14px"}}>
<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" style={{"fill": "none", "stroke": "#96c4f4", "strokeWidth": "1.6", "strokeLinecap": "round", "strokeLinejoin": "round"}}><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M4 7 L12 13 L20 7" /></svg>
<h3 style={{"margin": "0", "fontSize": "24px", "fontWeight": "400", "fontVariationSettings": "'wght' 500"}}>Prefer email?</h3>
</div>
<p style={{"margin": "0", "fontSize": "15px", "lineHeight": "1.6", "color": "#c9d2de"}}>Send a few lines about your business, your stage and what you want to fix. Sunil replies personally.</p>
<a href="mailto:sunil.kattikar@gmail.com" style={{"fontSize": "18px", "color": "#96c4f4", "wordBreak": "break-all", "fontVariationSettings": "'wght' 520"}}>sunil.kattikar@gmail.com</a>
<a href="mailto:sunil.kattikar@gmail.com?subject=SIXXAB%20AI%20strategy%20call&body=Business%3A%0AStage%20(Startup%2C%20Medium%2C%20Large)%3A%0AWhat%20I%20want%20to%20fix%3A%0A" style={{"marginTop": "auto", "display": "inline-flex", "alignItems": "center", "justifyContent": "center", "gap": "12px", "minHeight": "52px", "padding": "16px 28px", "borderRadius": "999px", "border": "1.6px solid rgba(196,214,232,.72)", "color": "#ffffff", "fontSize": "17px", "fontVariationSettings": "'wght' 540"}}>Email Sunil</a>
</div>
</div>
</section>
<footer style={{"padding": "40px clamp(22px, 8vw, 120px)", "borderTop": "1px solid rgba(196,214,232,.12)", "display": "flex", "flexWrap": "wrap", "alignItems": "center", "justifyContent": "space-between", "gap": "16px", "fontSize": "14px", "color": "#a2a9b8"}}>
<span>© 2026 SIXXAB AI · sixxab.ai</span>
<span style={{"display": "flex", "flexWrap": "wrap", "gap": "24px"}}><a href="/investors">Investors</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="mailto:sunil.kattikar@gmail.com">Contact</a></span>
</footer>
</div>
</>);
}
