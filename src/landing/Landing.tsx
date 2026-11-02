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
<a href="#platform">Platform</a>
<a href="#agency">AI agency</a>
<a href="#box">Startups in a Box</a>
<a href="#consultants">Consultants</a>
<a href="#pricing">Pricing</a>
</div>
<div className="navlinks l1" style={{"alignItems": "center", "gap": "24px", "fontSize": "14px", "fontVariationSettings": "'wght' 506"}}>
<a href="/login">Log in</a>
<a href="#begin" style={{"padding": "12px 22px", "border": "1.6px solid rgba(196,214,232,.72)", "borderRadius": "999px", "color": "#e8ecf0", "fontVariationSettings": "'wght' 581"}}>Book a strategy call</a>
</div>
<button type="button" className="burger" aria-label="Menu" aria-expanded={v.menuOpen} onClick={v.toggleMenu} style={{"width": "48px", "height": "44px", "alignItems": "center", "justifyContent": "center", "borderRadius": "999px", "border": "1.6px solid rgba(196,214,232,.72)", "background": "rgba(255,255,255,.04)", "color": "#fbfdff", "cursor": "pointer"}}>
<svg viewBox="0 0 22 14" width="20" height="14" aria-hidden="true" style={{"fill": "none", "stroke": "currentColor", "strokeWidth": "1.5", "strokeLinecap": "round"}}><path d="M1 1 H21" /><path d="M1 7 H21" /><path d="M1 13 H21" /></svg>
</button>
</nav>
{v.menuOpen ? (<>
<div style={{"position": "absolute", "zIndex": "6", "top": "96px", "right": "22px", "width": "min(300px, 82vw)", "padding": "14px", "borderRadius": "22px", "display": "flex", "flexDirection": "column", "gap": "2px", "background": "linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.045)), linear-gradient(180deg, rgba(6,12,22,.72), rgba(6,12,22,.82))", "backdropFilter": "blur(26px)", "boxShadow": "0 14px 38px rgba(2,6,14,.45)"}}>
<a href="#paths" style={{"padding": "13px 14px", "minHeight": "44px", "boxSizing": "border-box", "fontSize": "16px"}}>Your path</a>
<a href="#start" style={{"padding": "13px 14px", "minHeight": "44px", "boxSizing": "border-box", "fontSize": "16px"}}>Start the company</a>
<a href="#scale" style={{"padding": "13px 14px", "minHeight": "44px", "boxSizing": "border-box", "fontSize": "16px"}}>Scale the company</a>
<a href="#run" style={{"padding": "13px 14px", "minHeight": "44px", "boxSizing": "border-box", "fontSize": "16px"}}>Run the company</a>
<a href="#agency" style={{"padding": "13px 14px", "minHeight": "44px", "boxSizing": "border-box", "fontSize": "16px"}}>Marketing agency</a>
<a href="#box" style={{"padding": "13px 14px", "minHeight": "44px", "boxSizing": "border-box", "fontSize": "16px"}}>Startups in a Box</a>
<a href="#platform" style={{"padding": "13px 14px", "minHeight": "44px", "boxSizing": "border-box", "fontSize": "16px"}}>Platform</a>
<a href="#consultants" style={{"padding": "13px 14px", "minHeight": "44px", "boxSizing": "border-box", "fontSize": "16px"}}>Consultants</a>
<a href="#pricing" style={{"padding": "13px 14px", "minHeight": "44px", "boxSizing": "border-box", "fontSize": "16px"}}>Pricing</a>
<a href="#begin" style={{"marginTop": "8px", "padding": "13px 18px", "textAlign": "center", "border": "1.6px solid rgba(196,214,232,.72)", "borderRadius": "999px", "fontSize": "16px"}}>Book a strategy call</a>
</div>
</>) : null}
<div style={{"position": "relative", "zIndex": "1", "flex": "1", "display": "flex", "flexDirection": "column", "alignItems": "center", "justifyContent": "center", "textAlign": "center", "gap": "22px", "padding": "0 24px"}}>
<p className="l1" style={{"margin": "0", "fontSize": "14px", "letterSpacing": "3px", "textTransform": "uppercase", "color": "#ffe2b2", "fontVariationSettings": "'wght' 534"}}>You're a founder. Or you should be.</p>
<h1 className="h1" style={{"margin": "0", "fontSize": "clamp(34px, 4.4vw, 64px)", "lineHeight": "1.12", "fontWeight": "400", "fontVariationSettings": "'wght' 424", "letterSpacing": "-.01em"}}>
<span className="w1" style={{"display": "block"}}>Start it. Scale it. Run it.</span>
<span className="w2" style={{"display": "block"}}>AI that runs your company.</span>
</h1>
<p className="l2" aria-live="polite" style={{"margin": "0", "display": "flex", "justifyContent": "center", "alignItems": "flex-start", "gap": ".32em", "fontSize": "clamp(20px, 2vw, 28px)", "lineHeight": "1.3", "fontVariationSettings": "'wght' 446"}}><span>SIXXAB AI</span><span style={{"display": "inline-block", "height": "1.3em", "overflow": "hidden", "textAlign": "left"}}><span style={{"display": "flex", "flexDirection": "column", "transform": v.tickerShift, "transition": v.tickerEase}}>{(v.lines || []).map((ln, $index) => (<React.Fragment key={$index}><span style={{"display": "block", "height": "1.3em", "whiteSpace": "nowrap", "color": "#ffe2b2"}}>{ln}</span></React.Fragment>))}</span></span></p>
<p className="l2" style={{"margin": "0", "maxWidth": "40ch", "fontSize": "clamp(15px, 1.3vw, 18px)", "lineHeight": "1.5", "color": "#a2a9b8"}}>Your first employee and your whole team, from the first idea to $10M. It never sleeps.</p>
<div className="l3" style={{"display": "flex", "flexWrap": "wrap", "justifyContent": "center", "gap": "12px"}}>
<a href="#start" className="glass" style={{"display": "inline-flex", "alignItems": "center", "gap": "10px", "padding": "15px 26px", "borderRadius": "999px", "fontSize": "17px", "color": "#ffffff", "fontVariationSettings": "'wght' 497"}}><span style={{"color": "#ffe2b2"}}>01</span> Start the company</a>
<a href="#scale" className="glass" style={{"display": "inline-flex", "alignItems": "center", "gap": "10px", "padding": "15px 26px", "borderRadius": "999px", "fontSize": "17px", "color": "#ffffff", "fontVariationSettings": "'wght' 497"}}><span style={{"color": "#cfe3fa"}}>02</span> Scale the company</a>
<a href="#run" className="glass" style={{"display": "inline-flex", "alignItems": "center", "gap": "10px", "padding": "15px 26px", "borderRadius": "999px", "fontSize": "17px", "color": "#ffffff", "fontVariationSettings": "'wght' 497"}}><span style={{"color": "#96c4f4"}}>03</span> Run the company</a>
</div>
</div>
<p className="l4" style={{"position": "relative", "zIndex": "1", "margin": "0", "padding": "0 24px 44px", "textAlign": "center", "fontSize": "16px", "color": "#f4f8fd", "fontVariationSettings": "'wght' 521"}}>The solo founder's standing army.</p>
</header>
<section className="sec" style={{"padding": "120px clamp(22px, 8vw, 120px) 100px", "maxWidth": "1440px", "margin": "0 auto", "boxSizing": "border-box"}}>
<p style={{"margin": "0 0 16px", "fontSize": "13px", "letterSpacing": "3px", "textTransform": "uppercase", "color": "#ffe2b2", "fontVariationSettings": "'wght' 534"}}>Three heads. Six stages. One platform.</p>
<h2 className="h2" style={{"margin": "0 0 18px", "fontSize": "44px", "lineHeight": "1.15", "fontWeight": "400", "fontVariationSettings": "'wght' 424", "maxWidth": "24ch"}}>Wherever your company is, SIXXAB meets it there.</h2>
<p style={{"margin": "0 0 56px", "maxWidth": "60ch", "fontSize": "18px", "lineHeight": "1.55", "color": "#a2a9b8"}}>The SIXXAB Framework splits the journey from $0 to $10M into six stages, grouped into three jobs: start the company, scale it, then run it. The right agents switch on at each stage.</p>
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
<span style={{"marginTop": "auto", "paddingTop": "10px", "display": "inline-flex", "alignItems": "center", "gap": "10px", "fontSize": "15px", "color": "#ffffff"}}>See how
<svg viewBox="0 0 16 11" width="14" height="10" aria-hidden="true" style={{"fill": "none", "stroke": "currentColor", "strokeWidth": "1.6"}}><path d="M0 5.5 H14.6 M10.3 1.2 L14.9 5.5 L10.3 9.8" /></svg></span>
</a>
</React.Fragment>))}
</div>
</section>
<section id="paths" className="sec" style={{"padding": "110px clamp(22px, 8vw, 120px)", "background": "radial-gradient(60% 50% at 50% 0%, rgba(40,70,140,.22), rgba(2,6,15,0) 70%)"}}>
<div style={{"maxWidth": "1240px", "margin": "0 auto"}}>
<p style={{"margin": "0 0 16px", "fontSize": "13px", "letterSpacing": "3px", "textTransform": "uppercase", "color": "#ffe2b2", "fontVariationSettings": "'wght' 534"}}>The business case · Your path</p>
<h2 className="h2" style={{"margin": "0 0 18px", "fontSize": "44px", "lineHeight": "1.15", "fontWeight": "400", "fontVariationSettings": "'wght' 424", "maxWidth": "24ch"}}>Three paths to an AI-run company, step by step.</h2>
<p style={{"margin": "0 0 40px", "maxWidth": "60ch", "fontSize": "18px", "lineHeight": "1.55", "color": "#a2a9b8"}}>Pick the one that sounds like you. Each path runs end to end, from the first assessment to a company that runs on agents and keeps improving.</p>
<div role="group" aria-label="Choose your path" style={{"display": "flex", "flexWrap": "wrap", "gap": "10px", "marginBottom": "40px"}}>
{(v.journeys || []).map((j, $index) => (<React.Fragment key={$index}>
<button type="button" aria-pressed={j.active} onClick={j.pick} style={{"display": "inline-flex", "alignItems": "center", "gap": "10px", "minHeight": "48px", "padding": "12px 22px", "borderRadius": "999px", "border": `1.6px solid ${j.tabBorder}`, "background": j.tabBg, "color": j.tabInk, "fontFamily": "inherit", "fontSize": "15px", "cursor": "pointer", "fontVariationSettings": "'wght' 520"}}><span style={{"color": j.numInk}}>{j.n}</span>{j.who}</button>
</React.Fragment>))}
</div>
<div style={{"padding": "40px", "borderRadius": "28px", "border": `1px solid ${v.cur.border}`, "background": "linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.01))", "display": "flex", "flexDirection": "column", "gap": "36px"}}>
<div className="split" style={{"display": "grid", "gridTemplateColumns": "minmax(0, 1.3fr) minmax(0, 1fr)", "gap": "40px", "alignItems": "end"}}>
<div style={{"display": "flex", "flexDirection": "column", "gap": "12px"}}>
<span style={{"fontSize": "13px", "letterSpacing": "2px", "textTransform": "uppercase", "color": v.cur.color, "fontVariationSettings": "'wght' 560"}}>Path {v.cur.n} · {v.cur.who}</span>
<h3 style={{"margin": "0", "fontSize": "32px", "lineHeight": "1.2", "fontWeight": "400", "fontVariationSettings": "'wght' 460"}}>{v.cur.title}</h3>
</div>
<div style={{"display": "flex", "alignItems": "stretch", "gap": "10px", "fontSize": "14px", "lineHeight": "1.45"}}>
<div style={{"flex": "1", "padding": "14px 16px", "borderRadius": "14px", "background": "rgba(255,255,255,.04)", "display": "flex", "flexDirection": "column", "gap": "4px"}}><span style={{"fontSize": "11px", "letterSpacing": "1.5px", "textTransform": "uppercase", "color": "#8d96a8"}}>From</span><span style={{"color": "#c9d2de"}}>{v.cur.from}</span></div>
<div style={{"flex": "1", "padding": "14px 16px", "borderRadius": "14px", "background": v.cur.toBg, "display": "flex", "flexDirection": "column", "gap": "4px"}}><span style={{"fontSize": "11px", "letterSpacing": "1.5px", "textTransform": "uppercase", "color": v.cur.color}}>To</span><span style={{"color": "#ffffff"}}>{v.cur.to}</span></div>
</div>
</div>
<ol className="g3" style={{"listStyle": "none", "margin": "0", "padding": "0", "display": "grid", "gridTemplateColumns": "repeat(3, minmax(0, 1fr))", "gap": "14px"}}>
{(v.cur.steps || []).map((st, $index) => (<React.Fragment key={$index}>
<li style={{"padding": "24px", "borderRadius": "20px", "border": "1px solid rgba(196,214,232,.14)", "background": "rgba(2,6,15,.45)", "display": "flex", "flexDirection": "column", "gap": "10px"}}>
<div style={{"display": "flex", "alignItems": "center", "gap": "12px"}}>
<span style={{"width": "34px", "height": "34px", "flex": "none", "borderRadius": "50%", "border": `1.4px solid ${v.cur.color}`, "display": "inline-flex", "alignItems": "center", "justifyContent": "center", "fontSize": "13px", "color": v.cur.color, "fontVariationSettings": "'wght' 560"}}>{st.n}</span>
<h4 style={{"margin": "0", "fontSize": "19px", "fontWeight": "400", "fontVariationSettings": "'wght' 540"}}>{st.title}</h4>
</div>
<p style={{"margin": "0", "fontSize": "14px", "lineHeight": "1.6", "color": "#a2a9b8"}}>{st.body}</p>
<div style={{"marginTop": "auto", "paddingTop": "12px", "borderTop": "1px solid rgba(196,214,232,.1)", "display": "flex", "flexDirection": "column", "gap": "6px", "fontSize": "13px", "lineHeight": "1.45"}}>
<span><span style={{"color": "#8d96a8"}}>Agents · </span><span style={{"color": "#e2ebf5"}}>{st.agents}</span></span>
<span><span style={{"color": "#8d96a8"}}>You decide · </span><span style={{"color": "#ffffff"}}>{st.you}</span></span>
<span><span style={{"color": "#8d96a8"}}>You get · </span><span style={{"color": v.cur.color}}>{st.out}</span></span>
</div>
</li>
</React.Fragment>))}
</ol>
<div style={{"display": "flex", "flexWrap": "wrap", "alignItems": "center", "justifyContent": "space-between", "gap": "20px"}}>
<div style={{"display": "flex", "flexWrap": "wrap", "gap": "8px"}}>
{(v.cur.outcomes || []).map((oc, $index) => (<React.Fragment key={$index}>
<span style={{"display": "inline-flex", "alignItems": "center", "gap": "8px", "padding": "9px 15px", "borderRadius": "999px", "background": v.cur.toBg, "fontSize": "14px", "color": "#ffffff"}}><svg viewBox="0 0 14 11" width="12" height="10" aria-hidden="true" style={{"fill": "none", "stroke": v.cur.color, "strokeWidth": "1.8", "strokeLinecap": "round", "strokeLinejoin": "round"}}><path d="M1 5.5 L5 9.5 L13 1.5" /></svg>{oc}</span>
</React.Fragment>))}
</div>
<a href="#begin" className="glass" style={{"display": "inline-flex", "alignItems": "center", "gap": "12px", "padding": "15px 26px", "borderRadius": "999px", "fontSize": "17px", "color": "#ffffff", "fontVariationSettings": "'wght' 497"}}>{v.cur.cta}
<svg viewBox="0 0 16 11" width="16" height="11" aria-hidden="true" style={{"fill": "none", "stroke": "#ffffff", "strokeWidth": "1.6"}}><path d="M0 5.5 H14.6 M10.3 1.2 L14.9 5.5 L10.3 9.8" /></svg></a>
</div>
</div>
<div className="split" style={{"marginTop": "28px", "display": "grid", "gridTemplateColumns": "minmax(0, 1.25fr) minmax(0, 1fr)", "gap": "20px"}}>
<div style={{"padding": "34px", "borderRadius": "26px", "border": "1px solid rgba(255,226,178,.25)", "background": "rgba(255,226,178,.03)", "display": "flex", "flexDirection": "column", "gap": "18px"}}>
<span style={{"fontSize": "12px", "letterSpacing": "2px", "textTransform": "uppercase", "color": "#ffe2b2", "fontVariationSettings": "'wght' 560"}}>Loop engineering · every path</span>
<h3 style={{"margin": "0", "fontSize": "26px", "lineHeight": "1.25", "fontWeight": "400", "fontVariationSettings": "'wght' 480"}}>Humans in the loop. Learning in every loop.</h3>
<p style={{"margin": "0", "fontSize": "15px", "lineHeight": "1.6", "color": "#a2a9b8"}}>Every task runs through the same engineered loop. People approve what matters, every outcome is measured, and what the platform learns makes the next run better.</p>
<ol className="g3" style={{"listStyle": "none", "margin": "0", "padding": "0", "display": "grid", "gridTemplateColumns": "repeat(3, minmax(0, 1fr))", "gap": "10px"}}>
{(v.loopSteps || []).map((ls, $index) => (<React.Fragment key={$index}>
<li style={{"padding": "16px", "borderRadius": "16px", "border": `1px solid ${ls.border}`, "background": ls.bg, "display": "flex", "flexDirection": "column", "gap": "6px"}}>
<span style={{"fontSize": "12px", "color": ls.color, "fontVariationSettings": "'wght' 560"}}>{ls.n} · {ls.who}</span>
<span style={{"fontSize": "16px", "fontVariationSettings": "'wght' 540"}}>{ls.k}</span>
<span style={{"fontSize": "13px", "lineHeight": "1.5", "color": "#a2a9b8"}}>{ls.v}</span>
</li>
</React.Fragment>))}
</ol>
<p style={{"margin": "0", "fontSize": "13px", "color": "#8d96a8"}}>Step 6 feeds step 1. The loop never stops, and every agent, playbook and guardrail improves with it.</p>
</div>
<div style={{"padding": "34px", "borderRadius": "26px", "border": "1px solid rgba(150,196,244,.3)", "background": "rgba(150,196,244,.035)", "display": "flex", "flexDirection": "column", "gap": "18px"}}>
<span style={{"fontSize": "12px", "letterSpacing": "2px", "textTransform": "uppercase", "color": "#96c4f4", "fontVariationSettings": "'wght' 560"}}>Autonomy is earned</span>
<h3 style={{"margin": "0", "fontSize": "26px", "lineHeight": "1.25", "fontWeight": "400", "fontVariationSettings": "'wght' 480"}}>From assisted to autonomous operations.</h3>
<p style={{"margin": "0", "fontSize": "15px", "lineHeight": "1.6", "color": "#a2a9b8"}}>Each task moves up a level only after it proves itself. You set the limits, and you can step any task back down at any time.</p>
<ol style={{"listStyle": "none", "margin": "0", "padding": "0", "display": "flex", "flexDirection": "column", "gap": "10px"}}>
{(v.autonomy || []).map((au, $index) => (<React.Fragment key={$index}>
<li style={{"padding": "18px 20px", "borderRadius": "16px", "border": `1px solid ${au.border}`, "background": au.bg, "display": "flex", "gap": "16px", "alignItems": "flex-start"}}>
<span style={{"flex": "none", "width": "40px", "height": "40px", "borderRadius": "12px", "display": "inline-flex", "alignItems": "center", "justifyContent": "center", "fontSize": "14px", "color": "#02060f", "background": au.color, "fontVariationSettings": "'wght' 640"}}>L{au.n}</span>
<span style={{"display": "flex", "flexDirection": "column", "gap": "4px"}}><span style={{"fontSize": "17px", "fontVariationSettings": "'wght' 540"}}>{au.k}</span><span style={{"fontSize": "14px", "lineHeight": "1.5", "color": "#a2a9b8"}}>{au.v}</span></span>
</li>
</React.Fragment>))}
</ol>
</div>
</div>
</div>
</section>
{(v.details || []).map((d, $index) => (<React.Fragment key={$index}>
<section id={d.id} className="sec" style={{"padding": "100px clamp(22px, 8vw, 120px)", "background": d.wash}}>
<div className="split" style={{"maxWidth": "1200px", "margin": "0 auto", "display": "grid", "gridTemplateColumns": "minmax(0, 1fr) minmax(0, 1.1fr)", "gap": "64px", "alignItems": "start"}}>
<div style={{"display": "flex", "flexDirection": "column", "gap": "18px"}}>
<p style={{"margin": "0", "fontSize": "13px", "letterSpacing": "3px", "textTransform": "uppercase", "color": d.color, "fontVariationSettings": "'wght' 534"}}>{d.n} · {d.stages}</p>
<h2 className="h2" style={{"margin": "0", "fontSize": "44px", "lineHeight": "1.15", "fontWeight": "400", "fontVariationSettings": "'wght' 424"}}>{d.title}</h2>
<p style={{"margin": "0", "fontSize": "18px", "lineHeight": "1.6", "color": "#a2a9b8"}}>{d.body}</p>
<div style={{"display": "flex", "flexDirection": "column", "gap": "6px", "padding": "18px 20px", "borderRadius": "16px", "border": "1px solid rgba(196,214,232,.14)", "background": "rgba(255,255,255,.025)"}}>
<span style={{"fontSize": "11px", "letterSpacing": "1.5px", "textTransform": "uppercase", "color": "#8d96a8"}}>Agents on duty</span>
<span style={{"fontSize": "15px", "lineHeight": "1.5", "color": "#e2ebf5"}}>{d.agents}</span>
</div>
<a href="#begin" className="glass" style={{"alignSelf": "flex-start", "display": "inline-flex", "alignItems": "center", "gap": "12px", "padding": "15px 26px", "borderRadius": "999px", "fontSize": "17px", "color": "#ffffff", "fontVariationSettings": "'wght' 497"}}>{d.cta}
<svg viewBox="0 0 16 11" width="16" height="11" aria-hidden="true" style={{"fill": "none", "stroke": "#ffffff", "strokeWidth": "1.6"}}><path d="M0 5.5 H14.6 M10.3 1.2 L14.9 5.5 L10.3 9.8" /></svg></a>
</div>
<div className="g2" style={{"display": "grid", "gridTemplateColumns": "repeat(2, minmax(0, 1fr))", "gap": "14px"}}>
{(d.items || []).map((it, $index) => (<React.Fragment key={$index}>
<article style={{"padding": "26px", "borderRadius": "20px", "border": "1px solid rgba(196,214,232,.14)", "background": "linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.015))", "display": "flex", "flexDirection": "column", "gap": "10px"}}>
<span style={{"fontSize": "12px", "letterSpacing": "1.5px", "textTransform": "uppercase", "color": d.color, "fontVariationSettings": "'wght' 560"}}>{it.tag}</span>
<h3 style={{"margin": "0", "fontSize": "19px", "lineHeight": "1.3", "fontWeight": "400", "fontVariationSettings": "'wght' 520"}}>{it.title}</h3>
<p style={{"margin": "0", "fontSize": "14px", "lineHeight": "1.6", "color": "#a2a9b8"}}>{it.body}</p>
</article>
</React.Fragment>))}
</div>
</div>
</section>
</React.Fragment>))}
<section id="agency" className="sec" style={{"padding": "120px clamp(22px, 8vw, 120px)", "background": "radial-gradient(70% 60% at 50% 0%, rgba(255,200,120,.12), rgba(2,6,15,0) 70%)"}}>
<div style={{"maxWidth": "1200px", "margin": "0 auto"}}>
<p style={{"margin": "0 0 16px", "fontSize": "13px", "letterSpacing": "3px", "textTransform": "uppercase", "color": "#ffe2b2", "fontVariationSettings": "'wght' 534"}}>Built into Scale · AI marketing agency</p>
<div className="split" style={{"display": "grid", "gridTemplateColumns": "minmax(0, 1.4fr) minmax(0, 1fr)", "gap": "48px", "alignItems": "end", "marginBottom": "52px"}}>
<div>
<h2 className="h2" style={{"margin": "0 0 18px", "fontSize": "48px", "lineHeight": "1.12", "fontWeight": "400", "fontVariationSettings": "'wght' 424"}}>Your AI marketing agency, already on staff.</h2>
<p style={{"margin": "0", "maxWidth": "56ch", "fontSize": "18px", "lineHeight": "1.6", "color": "#a2a9b8"}}>A 50-agent marketing team that plans, creates, publishes and improves every channel, every day. You approve the strategy and the spend. The agents do the rest, and learn what works for your market.</p>
</div>
<div className="glass" style={{"padding": "30px", "borderRadius": "24px", "display": "flex", "flexDirection": "column", "gap": "6px"}}>
<span style={{"fontSize": "56px", "lineHeight": "1", "fontVariationSettings": "'wght' 260"}}>50</span>
<span style={{"fontSize": "15px", "color": "#c9d2de"}}>marketing agents, working as one agency</span>
</div>
</div>
<div className="g4" style={{"display": "grid", "gridTemplateColumns": "repeat(4, minmax(0, 1fr))", "gap": "14px", "marginBottom": "40px"}}>
{(v.agency || []).map((a, $index) => (<React.Fragment key={$index}>
<article style={{"padding": "24px", "borderRadius": "20px", "border": "1px solid rgba(255,226,178,.18)", "background": "rgba(255,226,178,.03)", "display": "flex", "flexDirection": "column", "gap": "10px"}}>
<h3 style={{"margin": "0", "fontSize": "18px", "fontWeight": "400", "fontVariationSettings": "'wght' 520"}}>{a.title}</h3>
<p style={{"margin": "0", "fontSize": "14px", "lineHeight": "1.55", "color": "#a2a9b8"}}>{a.body}</p>
</article>
</React.Fragment>))}
</div>
<div className="g2" style={{"display": "grid", "gridTemplateColumns": "repeat(2, minmax(0, 1fr))", "gap": "16px"}}>
<div style={{"padding": "30px", "borderRadius": "22px", "border": "1px solid rgba(196,214,232,.18)", "background": "rgba(255,255,255,.03)", "display": "flex", "flexDirection": "column", "gap": "10px"}}>
<span style={{"fontSize": "12px", "letterSpacing": "1.5px", "textTransform": "uppercase", "color": "#96c4f4"}}>Option A</span>
<h3 style={{"margin": "0", "fontSize": "22px", "fontWeight": "400", "fontVariationSettings": "'wght' 520"}}>Run it yourself, in the platform</h3>
<p style={{"margin": "0", "fontSize": "15px", "lineHeight": "1.6", "color": "#a2a9b8"}}>Included in every plan. Set goals and budget, approve the calendar, watch results in your morning briefing.</p>
</div>
<div style={{"padding": "30px", "borderRadius": "22px", "border": "1px solid rgba(255,226,178,.3)", "background": "rgba(255,226,178,.04)", "display": "flex", "flexDirection": "column", "gap": "10px"}}>
<span style={{"fontSize": "12px", "letterSpacing": "1.5px", "textTransform": "uppercase", "color": "#ffe2b2"}}>Option B</span>
<h3 style={{"margin": "0", "fontSize": "22px", "fontWeight": "400", "fontVariationSettings": "'wght' 520"}}>Done for you, by the SIXXAB agency</h3>
<p style={{"margin": "0", "fontSize": "15px", "lineHeight": "1.6", "color": "#a2a9b8"}}>Our team runs the agents for you, with industry playbooks for [INDUSTRY 1], [INDUSTRY 2] and local businesses.</p>
</div>
</div>
</div>
</section>
<section id="box" className="sec" style={{"padding": "120px clamp(22px, 8vw, 120px)", "background": "radial-gradient(70% 50% at 100% 0%, rgba(120,170,240,.12), rgba(2,6,15,0) 70%)"}}>
<div style={{"maxWidth": "1200px", "margin": "0 auto"}}>
<p style={{"margin": "0 0 16px", "fontSize": "13px", "letterSpacing": "3px", "textTransform": "uppercase", "color": "#ffe2b2", "fontVariationSettings": "'wght' 534"}}>Startups in a Box · Global expansion</p>
<h2 className="h2" style={{"margin": "0 0 18px", "fontSize": "48px", "lineHeight": "1.12", "fontWeight": "400", "fontVariationSettings": "'wght' 424", "maxWidth": "22ch"}}>A company in a box. Any size, any industry, any country.</h2>
<p style={{"margin": "0 0 56px", "maxWidth": "62ch", "fontSize": "18px", "lineHeight": "1.6", "color": "#a2a9b8"}}>Each box packages the right agents, playbooks, integrations and compliance for one business size, one industry and one market, so a new business or business line is running in days, not months.</p>
<div className="g3" style={{"display": "grid", "gridTemplateColumns": "repeat(3, minmax(0, 1fr))", "gap": "18px", "marginBottom": "56px"}}>
{(v.segments || []).map((sg, $index) => (<React.Fragment key={$index}>
<article style={{"padding": "32px", "borderRadius": "24px", "border": `1px solid ${sg.border}`, "background": sg.bg, "display": "flex", "flexDirection": "column", "gap": "12px"}}>
<span style={{"fontSize": "12px", "letterSpacing": "1.5px", "textTransform": "uppercase", "color": sg.color, "fontVariationSettings": "'wght' 560"}}>{sg.who}</span>
<h3 style={{"margin": "0", "fontSize": "24px", "fontWeight": "400", "fontVariationSettings": "'wght' 500"}}>{sg.box}</h3>
<p style={{"margin": "0", "fontSize": "15px", "lineHeight": "1.6", "color": "#a2a9b8"}}>{sg.body}</p>
<ul style={{"listStyle": "none", "margin": "6px 0 0", "padding": "0", "display": "flex", "flexDirection": "column", "gap": "8px"}}>
{(sg.points || []).map((pt, $index) => (<React.Fragment key={$index}>
<li style={{"display": "flex", "gap": "10px", "alignItems": "baseline", "fontSize": "14px", "lineHeight": "1.5", "color": "#e2ebf5"}}><svg viewBox="0 0 11 20" width="7" height="12" aria-hidden="true" style={{"flex": "none", "fill": "none", "stroke": sg.color, "strokeWidth": "2", "strokeLinecap": "round"}}><path d="M1.15 1.15 L9.6 10 L1.15 18.85" /></svg>{pt}</li>
</React.Fragment>))}
</ul>
</article>
</React.Fragment>))}
</div>
<div className="split" style={{"display": "grid", "gridTemplateColumns": "minmax(0, 1.3fr) minmax(0, 1fr)", "gap": "40px", "marginBottom": "48px"}}>
<div style={{"display": "flex", "flexDirection": "column", "gap": "16px"}}>
<h3 style={{"margin": "0", "fontSize": "22px", "fontWeight": "400", "fontVariationSettings": "'wght' 520"}}>Industry boxes</h3>
<div style={{"display": "flex", "flexWrap": "wrap", "gap": "8px"}}>
{(v.industries || []).map((ind, $index) => (<React.Fragment key={$index}>
<span style={{"display": "inline-flex", "alignItems": "center", "gap": "8px", "padding": "9px 15px", "borderRadius": "999px", "border": `1px solid ${ind.border}`, "background": "rgba(255,255,255,.035)", "fontSize": "14px", "color": "#e2ebf5"}}>{ind.name}{ind.tag ? (<><span style={{"fontSize": "11px", "letterSpacing": "1px", "textTransform": "uppercase", "color": "#ffe2b2"}}>{ind.tag}</span></>) : null}</span>
</React.Fragment>))}
</div>
</div>
<div style={{"display": "flex", "flexDirection": "column", "gap": "16px"}}>
<h3 style={{"margin": "0", "fontSize": "22px", "fontWeight": "400", "fontVariationSettings": "'wght' 520"}}>Markets</h3>
<div style={{"display": "flex", "flexDirection": "column", "gap": "8px"}}>
{(v.markets || []).map((mk, $index) => (<React.Fragment key={$index}>
<div style={{"display": "flex", "alignItems": "center", "justifyContent": "space-between", "gap": "16px", "padding": "12px 16px", "borderRadius": "14px", "border": "1px solid rgba(196,214,232,.14)", "background": "rgba(255,255,255,.025)"}}>
<span style={{"fontSize": "15px", "color": "#e2ebf5"}}>{mk.name}</span>
<span style={{"fontSize": "12px", "letterSpacing": "1px", "textTransform": "uppercase", "color": mk.color, "fontVariationSettings": "'wght' 560"}}>{mk.status}</span>
</div>
</React.Fragment>))}
</div>
</div>
</div>
<div className="glass" style={{"padding": "30px 32px", "borderRadius": "24px", "display": "flex", "flexDirection": "column", "gap": "18px"}}>
<h3 style={{"margin": "0", "fontSize": "20px", "fontWeight": "400", "fontVariationSettings": "'wght' 520"}}>What's in every box</h3>
<div className="g4" style={{"display": "grid", "gridTemplateColumns": "repeat(5, minmax(0, 1fr))", "gap": "18px"}}>
{(v.boxParts || []).map((bp, $index) => (<React.Fragment key={$index}>
<div style={{"display": "flex", "flexDirection": "column", "gap": "6px"}}>
<span style={{"fontSize": "15px", "color": "#ffffff", "fontVariationSettings": "'wght' 560"}}>{bp.k}</span>
<span style={{"fontSize": "13px", "lineHeight": "1.5", "color": "#c9d2de"}}>{bp.v}</span>
</div>
</React.Fragment>))}
</div>
<p style={{"margin": "0", "paddingTop": "14px", "borderTop": "1px solid rgba(255,255,255,.12)", "fontSize": "14px", "lineHeight": "1.55", "color": "#c9d2de"}}>Delivered directly by SIXXAB, or through certified SIXXAB CxO Strategy Consultants in your country.</p>
</div>
</div>
</section>
<section id="platform" className="sec" style={{"padding": "120px clamp(22px, 8vw, 120px)", "maxWidth": "1440px", "margin": "0 auto", "boxSizing": "border-box"}}>
<p style={{"margin": "0 0 16px", "fontSize": "13px", "letterSpacing": "3px", "textTransform": "uppercase", "color": "#ffe2b2", "fontVariationSettings": "'wght' 534"}}>The platform</p>
<h2 className="h2" style={{"margin": "0 0 18px", "fontSize": "44px", "lineHeight": "1.15", "fontWeight": "400", "fontVariationSettings": "'wght' 424", "maxWidth": "22ch"}}>One autonomous business platform. Every agent, connected.</h2>
<p style={{"margin": "0 0 56px", "maxWidth": "60ch", "fontSize": "18px", "lineHeight": "1.55", "color": "#a2a9b8"}}>Founder agents set direction. CXO agents turn it into plans. Department agents do the work. Every result flows back into shared memory, so every agent gets better every day.</p>
<div className="g4" style={{"display": "grid", "gridTemplateColumns": "repeat(4, minmax(0, 1fr))", "gap": "14px"}}>
{(v.layers || []).map((l, $index) => (<React.Fragment key={$index}>
<article style={{"padding": "28px", "borderRadius": "22px", "border": `1px solid ${l.border}`, "background": "rgba(255,255,255,.03)", "display": "flex", "flexDirection": "column", "gap": "10px"}}>
<span style={{"fontSize": "44px", "color": l.color, "fontVariationSettings": "'wght' 260"}}>{l.count}</span>
<h3 style={{"margin": "0", "fontSize": "19px", "fontWeight": "400", "fontVariationSettings": "'wght' 520"}}>{l.name}</h3>
<p style={{"margin": "0", "fontSize": "14px", "lineHeight": "1.55", "color": "#a2a9b8"}}>{l.body}</p>
</article>
</React.Fragment>))}
</div>
</section>
<section id="consultants" className="sec" style={{"padding": "120px clamp(22px, 8vw, 120px)", "background": "radial-gradient(70% 60% at 0% 100%, rgba(255,200,120,.10), rgba(2,6,15,0) 70%)"}}>
<div style={{"maxWidth": "1200px", "margin": "0 auto"}}>
<p style={{"margin": "0 0 16px", "fontSize": "13px", "letterSpacing": "3px", "textTransform": "uppercase", "color": "#ffe2b2", "fontVariationSettings": "'wght' 534"}}>SIXXAB Consultant Certification · Global expansion</p>
<div className="split" style={{"display": "grid", "gridTemplateColumns": "minmax(0, 1.35fr) minmax(0, 1fr)", "gap": "48px", "alignItems": "end", "marginBottom": "52px"}}>
<div>
<h2 className="h2" style={{"margin": "0 0 18px", "fontSize": "46px", "lineHeight": "1.12", "fontWeight": "400", "fontVariationSettings": "'wght' 424"}}>Become a certified SIXXAB consultant. Bring the platform to your market.</h2>
<p style={{"margin": "0", "maxWidth": "58ch", "fontSize": "18px", "lineHeight": "1.6", "color": "#a2a9b8"}}>We train and certify independent consultants to deliver SIXXAB strategy and AI transformation to startups, medium businesses and enterprises in their own countries, using the SIXXAB platform, playbooks and agents.</p>
</div>
<div className="glass" style={{"padding": "28px 30px", "borderRadius": "24px", "display": "flex", "flexDirection": "column", "gap": "10px"}}>
<span style={{"fontSize": "13px", "letterSpacing": "1.5px", "textTransform": "uppercase", "color": "#ffe2b2"}}>For consultants who want</span>
<span style={{"fontSize": "16px", "lineHeight": "1.55", "color": "#ffffff"}}>A proven framework, a platform to deliver it, and recurring revenue from every client they bring.</span>
</div>
</div>
<ol className="g4" style={{"listStyle": "none", "margin": "0 0 20px", "padding": "0", "display": "grid", "gridTemplateColumns": "repeat(5, minmax(0, 1fr))", "gap": "12px"}}>
{(v.certSteps || []).map((cs, $index) => (<React.Fragment key={$index}>
<li style={{"padding": "22px", "borderRadius": "20px", "border": "1px solid rgba(255,226,178,.2)", "background": "rgba(255,226,178,.03)", "display": "flex", "flexDirection": "column", "gap": "10px"}}>
<span style={{"fontSize": "28px", "color": "#ffe2b2", "fontVariationSettings": "'wght' 220"}}>{cs.n}</span>
<h3 style={{"margin": "0", "fontSize": "18px", "fontWeight": "400", "fontVariationSettings": "'wght' 540"}}>{cs.k}</h3>
<p style={{"margin": "0", "fontSize": "14px", "lineHeight": "1.55", "color": "#a2a9b8"}}>{cs.v}</p>
</li>
</React.Fragment>))}
</ol>
<div style={{"display": "flex", "flexDirection": "column", "gap": "20px"}}>
<div style={{"padding": "30px", "borderRadius": "22px", "border": "1px solid rgba(196,214,232,.16)", "background": "rgba(255,255,255,.03)", "display": "flex", "flexDirection": "column", "gap": "16px"}}>
<h3 style={{"margin": "0", "fontSize": "20px", "fontWeight": "400", "fontVariationSettings": "'wght' 520"}}>Every certified consultant gets</h3>
<div className="g2" style={{"display": "grid", "gridTemplateColumns": "repeat(2, minmax(0, 1fr))", "gap": "12px 24px"}}>
{(v.certGets || []).map((cg, $index) => (<React.Fragment key={$index}>
<span style={{"display": "flex", "gap": "10px", "alignItems": "baseline", "fontSize": "15px", "lineHeight": "1.5", "color": "#e2ebf5"}}><svg viewBox="0 0 14 11" width="12" height="10" aria-hidden="true" style={{"flex": "none", "fill": "none", "stroke": "#ffe2b2", "strokeWidth": "1.8", "strokeLinecap": "round", "strokeLinejoin": "round"}}><path d="M1 5.5 L5 9.5 L13 1.5" /></svg>{cg}</span>
</React.Fragment>))}
</div>
</div>
<div style={{"display": "flex", "flexWrap": "wrap", "alignItems": "center", "justifyContent": "space-between", "gap": "16px", "marginTop": "20px"}}>
<h3 style={{"margin": "0", "fontSize": "26px", "fontWeight": "400", "fontVariationSettings": "'wght' 480"}}>Three ways to join</h3>
<div role="group" aria-label="Choose market" style={{"display": "inline-flex", "padding": "4px", "borderRadius": "999px", "border": "1px solid rgba(196,214,232,.3)", "background": "rgba(255,255,255,.03)"}}>
{(v.marketTabs || []).map((mt, $index) => (<React.Fragment key={$index}>
<button type="button" aria-pressed={mt.active} onClick={mt.pick} style={{"minHeight": "44px", "padding": "10px 22px", "border": "0", "borderRadius": "999px", "background": mt.bg, "color": mt.ink, "fontFamily": "inherit", "fontSize": "15px", "cursor": "pointer", "fontVariationSettings": "'wght' 560"}}>{mt.label}</button>
</React.Fragment>))}
</div>
</div>
<div className="g3" style={{"display": "grid", "gridTemplateColumns": "repeat(3, minmax(0, 1fr))", "gap": "16px"}}>
{(v.tiersCert || []).map((tc, $index) => (<React.Fragment key={$index}>
<article style={{"padding": "32px", "borderRadius": "24px", "border": `1px solid ${tc.border}`, "background": tc.bg, "display": "flex", "flexDirection": "column", "gap": "14px"}}>
<span style={{"fontSize": "12px", "letterSpacing": "1.5px", "textTransform": "uppercase", "color": tc.color, "fontVariationSettings": "'wght' 560"}}>{tc.kicker}</span>
<h4 style={{"margin": "0", "fontSize": "24px", "fontWeight": "400", "fontVariationSettings": "'wght' 520"}}>{tc.name}</h4>
<p style={{"margin": "0", "fontSize": "14px", "lineHeight": "1.55", "color": "#a2a9b8"}}>{tc.tagline}</p>
<div style={{"display": "flex", "flexDirection": "column", "gap": "2px", "padding": "14px 0", "borderTop": "1px solid rgba(255,255,255,.1)", "borderBottom": "1px solid rgba(255,255,255,.1)"}}>
<span style={{"fontSize": "36px", "lineHeight": "1.1", "fontVariationSettings": "'wght' 340"}}>{tc.fee}</span>
<span style={{"fontSize": "13px", "color": "#a2a9b8"}}>one-time certification · then {tc.annual}</span>
</div>
<dl style={{"margin": "0", "display": "flex", "flexDirection": "column", "gap": "10px"}}>
{(tc.rows || []).map((rw, $index) => (<React.Fragment key={$index}>
<div style={{"display": "flex", "flexDirection": "column", "gap": "2px"}}><dt style={{"fontSize": "12px", "color": "#8d96a8"}}>{rw.k}</dt><dd style={{"margin": "0", "fontSize": "14px", "lineHeight": "1.45", "color": "#e2ebf5"}}>{rw.v}</dd></div>
</React.Fragment>))}
</dl>
<a href="#begin" style={{"marginTop": "auto", "padding": "14px 22px", "textAlign": "center", "borderRadius": "999px", "border": `1.6px solid ${tc.btn}`, "background": tc.btnBg, "color": tc.btnInk, "fontSize": "15px", "fontVariationSettings": "'wght' 540"}}>{tc.cta}</a>
</article>
</React.Fragment>))}
</div>
<p style={{"margin": "0", "fontSize": "13px", "lineHeight": "1.6", "color": "#8d96a8"}}>{v.certNote} Consultants keep 100% of their own consulting fees. Revenue share is paid on client platform subscriptions for 36 months while the client stays active. Fees exclude applicable taxes.</p>
</div>
</div>
</section>
<section id="pricing" className="sec" style={{"padding": "110px clamp(22px, 8vw, 120px)"}}>
<div style={{"maxWidth": "1200px", "margin": "0 auto", "textAlign": "center"}}>
<p style={{"margin": "0 0 16px", "fontSize": "13px", "letterSpacing": "3px", "textTransform": "uppercase", "color": "#ffe2b2", "fontVariationSettings": "'wght' 534"}}>Pricing</p>
<h2 className="h2" style={{"margin": "0 0 18px", "fontSize": "44px", "lineHeight": "1.15", "fontWeight": "400", "fontVariationSettings": "'wght' 424"}}>One plan for each path.</h2>
<p style={{"margin": "0 auto 52px", "maxWidth": "50ch", "fontSize": "18px", "lineHeight": "1.55", "color": "#a2a9b8"}}>A whole AI-run company for less than a small team. Every plan is a 12-month contract.</p>
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
<p style={{"margin": "0 auto 48px", "maxWidth": "46ch", "fontSize": "18px", "lineHeight": "1.55", "color": "#a2a9b8"}}>Book a strategy call with Sunil Kattikar, founder of SIXXAB AI. Tell us where your company is today, and leave with the path to start, scale or run it.</p>
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
<p style={{"margin": "0", "fontSize": "15px", "lineHeight": "1.6", "color": "#c9d2de"}}>Send a few lines about your company, your stage and what you want to fix. Sunil replies personally.</p>
<a href="mailto:sunil.kattikar@gmail.com" style={{"fontSize": "18px", "color": "#96c4f4", "wordBreak": "break-all", "fontVariationSettings": "'wght' 520"}}>sunil.kattikar@gmail.com</a>
<a href="mailto:sunil.kattikar@gmail.com?subject=SIXXAB%20AI%20strategy%20call&body=Company%3A%0AStage%20(Startup%2C%20Medium%2C%20Large)%3A%0AWhat%20I%20want%20to%20fix%3A%0A" style={{"marginTop": "auto", "display": "inline-flex", "alignItems": "center", "justifyContent": "center", "gap": "12px", "minHeight": "52px", "padding": "16px 28px", "borderRadius": "999px", "border": "1.6px solid rgba(196,214,232,.72)", "color": "#ffffff", "fontSize": "17px", "fontVariationSettings": "'wght' 540"}}>Email Sunil</a>
</div>
</div>
</section>
<footer style={{"padding": "40px clamp(22px, 8vw, 120px)", "borderTop": "1px solid rgba(196,214,232,.12)", "display": "flex", "flexWrap": "wrap", "alignItems": "center", "justifyContent": "space-between", "gap": "16px", "fontSize": "14px", "color": "#a2a9b8"}}>
<span>© 2026 SIXXAB AI · sixxab.ai</span>
<span style={{"display": "flex", "gap": "24px"}}><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="mailto:sunil.kattikar@gmail.com">Contact</a></span>
</footer>
</div>
</>);
}
