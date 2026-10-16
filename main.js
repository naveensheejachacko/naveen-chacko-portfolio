(() => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── nav: shadow once scrolled, progress bar, active section ── */
  const topbar = document.querySelector(".topbar");
  const progress = document.querySelector(".progress");
  let ticking = false;
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
    topbar.classList.toggle("scrolled", scrollY > 8);
    ticking = false;
  };
  addEventListener("scroll", () => {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  onScroll();

  const links = new Map(
    [...document.querySelectorAll('.nav nav a[href^="#"]')].map((a) => [a.hash.slice(1), a])
  );
  const spy = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      const a = links.get(e.target.id);
      if (!a) return;
      if (e.isIntersecting) {
        links.forEach((l) => l.classList.remove("active"));
        a.classList.add("active");
      } else {
        a.classList.remove("active");
      }
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  links.forEach((_, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });

  /* ── reveal on scroll ── */
  const revealables = document.querySelectorAll(
    "main > section:not(.hero) .sec-head, .ba, .why, .arch, .arch-info, .card, .path li, .stack p, .cta > *, .kpis"
  );
  const reveal = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target;
      el.classList.add("in");
      reveal.unobserve(el);
      // hand back to normal hover transitions once the entrance is done
      setTimeout(() => el.classList.remove("reveal", "in"), 800 + parseInt(el.style.getPropertyValue("--d") || 0));
    });
  }, { rootMargin: "0px 0px -8% 0px" });
  revealables.forEach((el) => {
    // stagger siblings in grids and lists
    const sibs = el.parentElement.children;
    el.style.setProperty("--d", `${Math.min([...sibs].indexOf(el), 4) * 70}ms`);
    el.classList.add("reveal");
    reveal.observe(el);
  });

  /* ── KPIs count from "before" to "after" ── */
  const kpis = document.querySelectorAll(".kpis b[data-from]");
  const run = (b) => {
    const from = +b.dataset.from, to = +b.dataset.to, suf = b.dataset.suffix || "";
    b.innerHTML = `<span class="was">${from}</span> → <span class="now">${from}</span>${suf}`;
    const now = b.querySelector(".now");
    if (reduced) { now.textContent = to; return; }
    const dur = 1400, t0 = performance.now();
    const step = (t) => {
      const p = Math.min((t - t0) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      now.textContent = Math.round(from + (to - from) * eased);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const kpiObs = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    kpis.forEach((b, i) => setTimeout(() => run(b), reduced ? 0 : i * 120));
    kpiObs.disconnect();
  }, { threshold: 0.4 });
  if (kpis.length) kpiObs.observe(kpis[0].closest(".kpis"));

  /* ── throughput bars grow when the table appears ── */
  const ba = document.querySelector(".ba");
  if (ba) {
    new IntersectionObserver((entries, o) => {
      if (entries[0].isIntersecting) { ba.classList.add("grow"); o.disconnect(); }
    }, { threshold: 0.5 }).observe(ba);
  }

  /* ── architecture: explain each component ── */
  const INFO = {
    client: ["Mobile app and web", "Where TravLounge customers book and pay. Every request comes in through the load balancer."],
    alb: ["Application Load Balancer", "Spreads incoming traffic across however many API tasks are running at the moment."],
    api: ["Django API on Gunicorn", "3 workers × 4 threads, so each task handles 12 requests at once instead of 3. ECS scales it from 1 to 8 tasks on CPU, which is what took it from ~15 to 500+ req/s."],
    celery: ["Celery workers + beat", "13 background job types, written so a retry never sends a customer the same message twice."],
    redis: ["Redis", "Per-user response cache, the Celery queue and the Django Channels layer for WebSocket notifications. Cached hits on the busiest endpoint run 0 queries."],
    elastic: ["Elasticsearch", "Search, kept off the main database."],
    db: ["PostgreSQL on Amazon RDS", "The main database. I cut the busiest endpoint from 10–22 queries down to 4."],
    s3: ["Amazon S3", "Invoices and media."],
    ext: ["Third-party services", "Razorpay for four products behind one handler registry, with webhooks that are safe to receive twice. WhatsApp, FCM and MSG91 for messages and push."],
    obs: ["OpenObserve + Prometheus", "Logs, metrics and traces in one place, with 9 Slack alerts for 5xx errors, Redis, Celery backlog and the database."],
    ci: ["GitHub Actions → ECR → ECS", "Images build to ECR and roll out to ECS. Production needs a reviewer's approval, and CI checks every release branch."],
  };
  const arch = document.querySelector(".arch svg");
  const info = document.querySelector(".arch-info");
  if (arch && info) {
    const hint = info.innerHTML;
    let pinned = null;
    const show = (g) => {
      arch.querySelectorAll(".node").forEach((n) => n.classList.toggle("on", n === g));
      arch.classList.toggle("focus", !!g);
      if (!g) { info.innerHTML = hint; return; }
      const [t, d] = INFO[g.dataset.n];
      info.innerHTML = `<b>${t}</b> ${d}`;
    };
    arch.querySelectorAll(".node[data-n]").forEach((g) => {
      const [t] = INFO[g.dataset.n];
      g.setAttribute("tabindex", "0");
      g.setAttribute("role", "button");
      g.setAttribute("aria-label", t);
      g.addEventListener("mouseenter", () => show(g));
      g.addEventListener("mouseleave", () => show(pinned));
      g.addEventListener("focus", () => show(g));
      g.addEventListener("click", () => { pinned = pinned === g ? null : g; show(pinned || g); });
      g.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); g.click(); }
        if (e.key === "Escape") { pinned = null; g.blur(); show(null); }
      });
    });
    arch.addEventListener("focusout", (e) => { if (!arch.contains(e.relatedTarget)) show(pinned); });
  }

  /* ── cursor spotlight on cards ── */
  if (matchMedia("(hover: hover)").matches) {
    document.querySelectorAll(".card").forEach((c) => {
      c.addEventListener("pointermove", (e) => {
        const r = c.getBoundingClientRect();
        c.style.setProperty("--mx", `${e.clientX - r.left}px`);
        c.style.setProperty("--my", `${e.clientY - r.top}px`);
      });
    });
  }

  /* ── copy email ── */
  const copy = document.querySelector(".copy");
  if (copy && navigator.clipboard) {
    copy.hidden = false;
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(copy.dataset.copy);
        copy.textContent = "Copied ✓";
        copy.classList.add("done");
      } catch (_) {
        copy.textContent = "Press Ctrl+C";
      }
      setTimeout(() => { copy.textContent = "Copy"; copy.classList.remove("done"); }, 1800);
    });
  }
})();
