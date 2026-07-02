import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Code2,
  LifeBuoy,
  Mail,
  MonitorSmartphone,
  Rocket,
  Send,
  Server,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import heroImage from "./assets/nehost-hero.png";
import showcaseImage from "./assets/nehost-showcase.png";

const CONTACT_EMAIL = import.meta.env.VITE_CONTACT_EMAIL || "nehost@nenosensei.com";
const CONTACT_FORM_ENDPOINT =
  import.meta.env.VITE_CONTACT_FORM_ENDPOINT ||
  `https://formsubmit.co/ajax/${encodeURIComponent(CONTACT_EMAIL)}`;

const services = [
  {
    title: "Custom Website Design",
    body: "Clean, responsive sites tailored around your brand, offer, and audience.",
    icon: MonitorSmartphone,
  },
  {
    title: "Fast, Secure Hosting",
    body: "Launch-ready hosting, SSL, performance checks, and practical uptime care.",
    icon: Zap,
  },
  {
    title: "Ongoing Support",
    body: "Updates, backups, maintenance, and improvements after your site is live.",
    icon: LifeBuoy,
  },
  {
    title: "Built to Grow",
    body: "Add booking, forms, galleries, payments, automations, and richer pages later.",
    icon: Rocket,
  },
];

const concepts = [
  {
    id: "restaurant",
    title: "Restaurant Launch",
    color: "coral",
    line: "Menus, ordering, reservations, and a polished local search presence.",
    brand: "Modern Hearth",
    nav: ["Menu", "Events", "Reserve"],
    kicker: "Seasonal dining",
    headline: "A warm table, booked in seconds.",
    subline: "Showcase signature dishes, private events, hours, and reservations in one mobile-first flow.",
    spotlight: "Chef's tasting menu",
    cards: ["Dinner menu", "Wine nights", "Private dining"],
    stats: ["4.8 rating", "Open today", "Book online"],
  },
  {
    id: "service",
    title: "Service Business",
    color: "green",
    line: "Quote requests, service pages, trust signals, and a fast mobile experience.",
    brand: "Northline Pros",
    nav: ["Services", "Reviews", "Quote"],
    kicker: "Local service team",
    headline: "Get a clean quote before the weekend.",
    subline: "Turn visitors into leads with service pages, proof points, project photos, and quote requests.",
    spotlight: "Same-week estimates",
    cards: ["Roof repair", "Remodeling", "Emergency calls"],
    stats: ["Licensed", "250+ jobs", "Free quote"],
  },
  {
    id: "portfolio",
    title: "Creator Portfolio",
    color: "cyan",
    line: "Case studies, media, booking links, and a sharp visual identity.",
    brand: "Avery Studio",
    nav: ["Work", "About", "Book"],
    kicker: "Creative portfolio",
    headline: "Selected work with a premium first impression.",
    subline: "Present case studies, galleries, press, and booking links in a visual layout that feels custom.",
    spotlight: "Featured project",
    cards: ["Brand film", "Photo set", "Campaign"],
    stats: ["12 case studies", "Media kit", "Now booking"],
  },
];

const processSteps = [
  {
    title: "Tell us about your project",
    body: "Share your goals, services, must-have pages, and a few sites you like.",
    icon: Mail,
  },
  {
    title: "We build a demo site",
    body: "You get a first-look concept so you can see how your site could feel.",
    icon: Code2,
  },
  {
    title: "Review and refine",
    body: "We tighten copy, layout, visuals, and functionality around your business.",
    icon: Sparkles,
  },
  {
    title: "Launch and support",
    body: "Your site goes live with hosting, security basics, and practical care.",
    icon: Server,
  },
];

const projectTypes = [
  "Basic business site",
  "Landing page",
  "Online booking",
  "Portfolio",
  "Restaurant or menu site",
  "Online store",
  "Not sure yet",
];

function App() {
  const [activeConcept, setActiveConcept] = useState(0);
  const [form, setForm] = useState({
    name: "",
    email: "",
    type: "Basic business site",
    message: "",
  });
  const [formStatus, setFormStatus] = useState({
    tone: "idle",
    message: "Send your project details directly to NeHost without leaving the site.",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveConcept((current) => (current + 1) % concepts.length);
    }, 4200);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll("[data-reveal]"));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.16 },
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  const mailtoHref = useMemo(() => {
    const subject = encodeURIComponent("NeHost demo consultation request");
    const body = encodeURIComponent(
      [
        "Hi NeHost,",
        "",
        "I would like to schedule a demo consultation.",
        "",
        `Name: ${form.name || ""}`,
        `Email: ${form.email || ""}`,
        `Project type: ${form.type || ""}`,
        "",
        "Project notes:",
        form.message || "",
      ].join("\n"),
    );

    return `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
  }, [form]);

  const handleInput = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const name = form.name.trim();
    const email = form.email.trim();
    const message = form.message.trim();

    if (!name || !email || !message) {
      setFormStatus({
        tone: "error",
        message: "Please add your name, email, and project notes before sending.",
      });
      return;
    }

    if (!email.includes("@") || !email.includes(".")) {
      setFormStatus({
        tone: "error",
        message: "Please enter a valid email address so we can reply to you.",
      });
      return;
    }

    setIsSubmitting(true);
    setFormStatus({ tone: "idle", message: "Sending your consultation request..." });

    try {
      const response = await fetch(CONTACT_FORM_ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          "project type": form.type,
          message,
          source: "nehost.nenosensei.com contact form",
          _captcha: "false",
          _honey: "",
          _replyto: email,
          _subject: `NeHost consultation request - ${form.type}`,
          _template: "table",
        }),
      });

      if (!response.ok) {
        throw new Error("Contact service did not accept the message.");
      }

      setForm({ name: "", email: "", type: "Basic business site", message: "" });
      setFormStatus({
        tone: "success",
        message: "Message sent. NeHost will follow up with you soon.",
      });
    } catch {
      setFormStatus({
        tone: "error",
        message:
          "The in-site message could not be sent. Please use the email link beside the form.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const scrollToContact = () => {
    document.getElementById("contact")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main>
      <header className="site-header" aria-label="Primary navigation">
        <BrandLogo />
        <nav>
          <a href="#services">Services</a>
          <a href="#work">Our Work</a>
          <a href="#pricing">Pricing</a>
          <a href="#process">Process</a>
          <a href="#contact">Contact</a>
        </nav>
        <button className="header-cta" type="button" onClick={scrollToContact}>
          <CalendarDays size={17} aria-hidden="true" />
          <span>Schedule a demo consult</span>
        </button>
      </header>

      <section className="hero" id="top">
        <img className="hero-image" src={heroImage} alt="" aria-hidden="true" />
        <div className="hero-shell">
          <div className="hero-copy" data-reveal>
            <h1>
              We build and host websites that grow <span>your business.</span>
            </h1>
            <p>
              NeHost creates modern, fast, and secure websites, then hosts and maintains them so
              you can focus on serving your customers.
            </p>
            <div className="hero-actions">
              <button className="button button-primary" type="button" onClick={scrollToContact}>
                <CalendarDays size={19} aria-hidden="true" />
                Schedule a demo consult
                <ArrowRight size={19} aria-hidden="true" />
              </button>
              <a className="button button-secondary" href={mailtoHref}>
                <Mail size={19} aria-hidden="true" />
                Email NeHost
                <ArrowRight size={19} aria-hidden="true" />
              </a>
            </div>
          </div>

          <div className="hero-console" data-reveal>
            <div className="console-top">
              <span />
              <span />
              <span />
            </div>
            <div className="console-line">
              <strong>Build</strong>
              <span>responsive design</span>
            </div>
            <div className="console-line">
              <strong>Host</strong>
              <span>SSL, backups, speed</span>
            </div>
            <div className="console-line is-live">
              <strong>Launch</strong>
              <span>demo consult ready</span>
            </div>
          </div>
        </div>
      </section>

      <section className="service-strip" id="services" aria-label="NeHost services">
        <div className="section-inner service-grid">
          <div className="strip-heading" data-reveal>
            <h2>
              Everything you need. <span>One partner.</span>
            </h2>
          </div>
          {services.map((service) => {
            const Icon = service.icon;
            return (
              <article className="service-item" key={service.title} data-reveal>
                <Icon aria-hidden="true" size={34} strokeWidth={1.8} />
                <div>
                  <h3>{service.title}</h3>
                  <p>{service.body}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="pricing-band" id="pricing">
        <div className="section-inner pricing-layout">
          <div className="pricing-copy" data-reveal>
            <h2>
              Starter sites from <span>$300</span>
            </h2>
            <p>Final quote depends on scope.</p>
          </div>
          <div className="proof-row" data-reveal>
            <ProofPoint icon={CheckCircle2} title="Transparent pricing" body="You know what is included before work begins." />
            <ProofPoint icon={CalendarDays} title="No pressure demo" body="See a demo direction before deciding what to launch." />
            <ProofPoint icon={ShieldCheck} title="Quality you can count on" body="Modern design, secure hosting basics, and clean handoff." />
          </div>
        </div>
      </section>

      <section className="work-section" id="work">
        <div className="section-inner work-layout">
          <div className="work-copy" data-reveal>
            <h2>
              Websites that <span>work.</span>
            </h2>
            <p>
              Your demo consult is where we translate your business into a page people can trust,
              understand, and act on.
            </p>
            <div className="concept-tabs" role="tablist" aria-label="Website concept examples">
              {concepts.map((concept, index) => (
                <button
                  aria-selected={activeConcept === index}
                  className={activeConcept === index ? "is-active" : ""}
                  key={concept.title}
                  onClick={() => setActiveConcept(index)}
                  role="tab"
                  type="button"
                >
                  {concept.title}
                </button>
              ))}
            </div>
          </div>

          <div className="showcase-stage" data-reveal>
            <img
              className="showcase-image"
              src={showcaseImage}
              alt="Three polished client website concepts displayed across desktop and mobile mockups."
            />
            <div className="live-preview" aria-live="polite">
              <MockBrowser concept={concepts[activeConcept]} />
              <p>{concepts[activeConcept].line}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="process-section" id="process">
        <div className="section-inner">
          <div className="section-heading" data-reveal>
            <h2>
              Our consultation <span>process</span>
            </h2>
            <p>Simple, collaborative, and built around what your customers need to see first.</p>
          </div>
          <div className="process-grid">
            {processSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <article className="process-card" key={step.title} data-reveal>
                  <div className="step-number">{index + 1}</div>
                  <Icon aria-hidden="true" size={31} strokeWidth={1.8} />
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                  {index < processSteps.length - 1 ? (
                    <ChevronRight className="step-arrow" size={24} aria-hidden="true" />
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="contact-section" id="contact">
        <div className="section-inner contact-layout">
          <div className="contact-copy" data-reveal>
            <h2>
              Let&apos;s build something great. <span>Email NeHost.</span>
            </h2>
            <p>
              Send a message and we will start with your goals, then schedule a consultation to
              walk through a demo site direction.
            </p>
            <a className="email-link" href={mailtoHref}>
              <Mail size={20} aria-hidden="true" />
              {CONTACT_EMAIL}
            </a>
          </div>

          <form className="contact-form" onSubmit={handleSubmit} data-reveal>
            <label>
              <span>Your name</span>
              <input
                autoComplete="name"
                name="name"
                onChange={handleInput}
                placeholder="Jane Smith"
                type="text"
                value={form.name}
              />
            </label>
            <label>
              <span>Email address</span>
              <input
                autoComplete="email"
                name="email"
                onChange={handleInput}
                placeholder="jane@company.com"
                type="email"
                value={form.email}
              />
            </label>
            <label>
              <span>Project type</span>
              <select name="type" onChange={handleInput} value={form.type}>
                {projectTypes.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
            <label className="message-field">
              <span>Tell us about your project</span>
              <textarea
                name="message"
                onChange={handleInput}
                placeholder="What are you looking to build?"
                rows="5"
                value={form.message}
              />
            </label>
            <button className="button button-primary form-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Sending..." : "Send message"}
              <Send size={18} aria-hidden="true" />
            </button>
            <p className={`form-status is-${formStatus.tone}`} role="status">
              {formStatus.message}
            </p>
          </form>
        </div>
      </section>

      <footer className="site-footer">
        <div className="section-inner footer-layout">
          <div>
            <BrandLogo className="footer-brand" />
          </div>
          <div className="footer-links">
            <a href="#services">Services</a>
            <a href="#work">Our Work</a>
            <a href="#pricing">Pricing</a>
            <a href="#contact">Contact</a>
          </div>
        </div>
      </footer>
    </main>
  );
}

function ProofPoint({ icon: Icon, title, body }) {
  return (
    <article className="proof-point">
      <Icon aria-hidden="true" size={29} strokeWidth={1.8} />
      <div>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
    </article>
  );
}

function BrandLogo({ className = "" }) {
  return (
    <a className={`brand ${className}`.trim()} href="#top" aria-label="NeHost home">
      <span className="brand-mark" aria-hidden="true">
        <span>N</span>
        <span>H</span>
      </span>
      <span className="brand-word">
        <span className="brand-ne">Ne</span>Host
      </span>
    </a>
  );
}

function MockBrowser({ concept }) {
  return (
    <div className={`mock-browser mock-${concept.color} mock-${concept.id}`}>
      <div className="mock-chrome">
        <span />
        <span />
        <span />
      </div>
      <div className="mock-site-nav">
        <strong>{concept.brand}</strong>
        <div>
          {concept.nav.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </div>
      <div className="mock-site-hero">
        <div className="mock-site-copy">
          <span>{concept.kicker}</span>
          <h3>{concept.headline}</h3>
          <p>{concept.subline}</p>
        </div>
        <div className="mock-site-visual" aria-hidden="true">
          <div className="mock-image-stack">
            <span />
            <span />
            <span />
          </div>
          <strong>{concept.spotlight}</strong>
        </div>
      </div>
      <div className="mock-site-cards">
        {concept.cards.map((card) => (
          <article key={card}>
            <span />
            <strong>{card}</strong>
          </article>
        ))}
      </div>
      <div className="mock-site-stats">
        {concept.stats.map((stat) => (
          <span key={stat}>{stat}</span>
        ))}
      </div>
    </div>
  );
}

export default App;
