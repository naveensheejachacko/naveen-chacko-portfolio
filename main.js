(() => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sleep = (ms) => new Promise((r) => setTimeout(r, reduced ? 0 : ms));
  const rand = (n, chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789") =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");

  /* ── theme ───────────────────────── */
  const root = document.documentElement;
  try {
    const saved = localStorage.getItem("theme");
    if (saved) root.dataset.theme = saved;
  } catch (_) {}
  document.querySelector(".theme").addEventListener("click", () => {
    const dark = root.dataset.theme
      ? root.dataset.theme === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("theme", root.dataset.theme); } catch (_) {}
  });

  /* ── trace rows ───────────────────────── */
  document.querySelectorAll(".span .row").forEach((btn) => {
    btn.addEventListener("click", () => {
      const open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!open));
      document.getElementById(btn.getAttribute("aria-controls")).hidden = open;
    });
  });

  /* ── console: every line has a plain version and a server-log version ── */
  function makeConsole(el, toggle, hint) {
    let entries = [];
    const html = (e) => (e.rule ? '<span class="hr"></span>' : `<div>${toggle.checked ? e.t : e.p}</div>`);
    const paint = () => {
      el.classList.toggle("plain", !toggle.checked);
      el.innerHTML = entries.length ? entries.map(html).join("") : `<span class="dim">${hint}</span>`;
      el.scrollTop = el.scrollHeight;
    };
    toggle.addEventListener("change", paint);
    paint();
    return {
      line(p, t = p) {
        entries.push({ p, t });
        paint();
      },
      rule() { if (entries.length) entries.push({ rule: true }); },
      clear() { entries = []; paint(); },
    };
  }

  /* ── demo 1: webhook idempotency ───────────────────────── */
  const wh = document.getElementById("webhook");
  const whLog = makeConsole(
    document.getElementById("wh-log"),
    wh.querySelector("[data-tech]"),
    "Start with 1, then press 2 to see what happens when the same message arrives twice."
  );
  const whType = document.getElementById("wh-type");
  const whButtons = wh.querySelectorAll(".controls button");
  const count = { recv: 0, book: 0, wa: 0, rej: 0 };
  const processed = new Set();
  let last = null;

  const HANDLERS = {
    sleeping_pod: ["SleepingPodPaymentHandler", "sleeping pod booking", "TL", "CONFIRMED"],
    car_wash: ["CarWashPaymentHandler", "car wash slot", "CW", "CONFIRMED"],
    food: ["FoodPaymentHandler", "food order", "FD", "PLACED"],
    subscription: ["SubscriptionPaymentHandler", "subscription", "SB", "ACTIVE"],
  };

  function bump(k) {
    count[k]++;
    const b = wh.querySelector(`[data-k="${k}"]`);
    b.textContent = count[k];
    b.classList.add("flash");
    setTimeout(() => b.classList.remove("flash"), 600);
  }

  async function receive(evt, { forged = false, again = false } = {}) {
    whLog.rule();
    bump("recv");
    whLog.line(
      `<span class="in">→ ${forged ? "A message claiming to be from Razorpay" : again ? "Razorpay (again)" : "Razorpay"}:</span> "Payment ${evt.pay} went through."`,
      `<span class="in">→ POST /webhooks/razorpay</span>  event=payment.captured  ${evt.pay}`
    );
    await sleep(380);
    if (forged) {
      whLog.line(
        `  Is this really from Razorpay? Its signature doesn't match.  <span class="bad">✗ fake</span>`,
        `  verify HMAC-SHA256(body, secret) vs X-Razorpay-Signature   <span class="bad">✗ mismatch</span>`
      );
      await sleep(300);
      whLog.line(
        `<span class="bad">← Rejected.</span> <span class="dim">Nothing booked, nothing saved.</span>`,
        `<span class="bad">← 400 Bad Request</span>  <span class="dim">rejected before any DB read or write</span>`
      );
      bump("rej");
      return;
    }
    whLog.line(
      `  Is this really from Razorpay? Signature matches.  <span class="ok">✓</span>`,
      `  verify HMAC-SHA256(body, secret) vs X-Razorpay-Signature   <span class="ok">✓</span>`
    );
    await sleep(380);
    const key = `payment:${evt.pay}:confirmed`;
    if (processed.has(evt.pay)) {
      whLog.line(
        `  Have we handled this payment before? <span class="acc">Yes.</span> So do nothing.`,
        `  SET ${key} 1 NX EX 86400   <span class="acc">(nil)</span>  <span class="dim">already confirmed, skip</span>`
      );
      await sleep(300);
      whLog.line(
        `<span class="ok">← Reply "got it".</span> <span class="dim">Still one booking, one invoice, one WhatsApp message.</span>`,
        `<span class="ok">← 200 OK</span>  <span class="dim">Razorpay stops retrying</span>`
      );
      return;
    }
    processed.add(evt.pay);
    whLog.line(
      `  Have we handled this payment before? <span class="ok">No.</span> Note it down so we never do it twice.`,
      `  SET ${key} 1 NX EX 86400   <span class="ok">OK</span>`
    );
    await sleep(380);
    const [cls, what, prefix, status] = HANDLERS[evt.type];
    const ref = `${prefix}-${evt.ref}`;
    whLog.line(
      `  Confirm the ${what} ${ref}.  <span class="ok">${status.toLowerCase()} ✓</span>`,
      `  PAYMENT_HANDLERS["${evt.type}"] → ${cls}.confirm()  ${ref} → <span class="ok">${status}</span>`
    );
    bump("book");
    await sleep(320);
    const ms = 14 + Math.floor(Math.random() * 12);
    whLog.line(
      `<span class="ok">← Reply "got it" in ${ms} ms.</span> <span class="dim">Slow work happens after, so Razorpay isn't kept waiting.</span>`,
      `  chain(invoice_pdf | s3_upload | whatsapp_send).delay()  <span class="dim">queued</span>\n<span class="ok">← 200 OK</span>  ${ms}ms`
    );
    await sleep(650);
    whLog.line(
      `  <span class="dim">In the background:</span> make invoice PDF <span class="ok">✓</span>  store it <span class="ok">✓</span>  send WhatsApp <span class="ok">✓</span>`,
      `  <span class="dim">[celery]</span> invoice_pdf <span class="ok">✓</span>   s3_upload <span class="ok">✓</span>   whatsapp_send <span class="ok">✓</span>`
    );
    bump("wa");
  }

  async function run(fn) {
    whButtons.forEach((b) => (b.disabled = true));
    try { await fn(); } finally { whButtons.forEach((b) => (b.disabled = false)); }
  }

  wh.querySelector(".controls").addEventListener("click", (e) => {
    const act = e.target.closest("button")?.dataset.act;
    if (!act) return;
    if (act === "send") {
      last = { pay: "pay_" + rand(10), type: whType.value, ref: rand(4, "0123456789") };
      run(() => receive(last));
    } else if (act === "retry") {
      if (!last) {
        whLog.rule();
        whLog.line(`<span class="dim">Nothing to resend yet. Press 1 first.</span>`);
        return;
      }
      run(() => receive(last, { again: true }));
    } else if (act === "forge") {
      run(() => receive({ pay: "pay_" + rand(10), type: whType.value, ref: "0000" }, { forged: true }));
    } else if (act === "reset") {
      processed.clear();
      last = null;
      Object.keys(count).forEach((k) => { count[k] = 0; wh.querySelector(`[data-k="${k}"]`).textContent = "0"; });
      whLog.clear();
    }
  });

  /* ── demo 2: cache ───────────────────────── */
  const cacheEl = document.getElementById("cache");
  const cLog = makeConsole(
    document.getElementById("c-log"),
    cacheEl.querySelector("[data-tech]"),
    "Nothing is saved yet. Open the home screen twice and compare the load times."
  );
  const clockEl = document.getElementById("c-clock");
  let now = 0; // minutes since start
  const KEYS = {
    banners: { name: "home:banners", label: "banners", ttl: Infinity, cost: 38, at: null },
    categories: { name: "home:categories", label: "categories", ttl: 720, cost: 24, at: null },
    sub: { name: "sub:user:42", label: "subscription", ttl: 10, cost: 17, at: null },
  };

  const fmt = (m) => {
    const h = Math.floor(m / 60), mm = m % 60;
    return h ? `${h}h ${String(mm).padStart(2, "0")}m` : `${mm}m`;
  };
  const alive = (k) => k.at !== null && now - k.at < k.ttl;

  function paint(flash = {}) {
    clockEl.textContent = fmt(now);
    for (const [id, k] of Object.entries(KEYS)) {
      const row = cacheEl.querySelector(`.key[data-key="${id}"]`);
      const st = row.querySelector(".state");
      row.classList.remove("hit", "miss", "gone");
      if (flash[id]) row.classList.add(flash[id]);
      if (k.at === null) st.textContent = flash[id] === "gone" ? "copy thrown away" : "no copy yet";
      else if (!alive(k)) { st.textContent = "copy expired"; row.classList.add("gone"); }
      else {
        const left = k.ttl === Infinity ? "" : ` · ${fmt(k.ttl - (now - k.at))} left`;
        st.textContent =
          flash[id] === "miss" ? `fetched fresh${left}` : flash[id] === "hit" ? `used saved copy${left}` : `copy saved${left}`;
      }
    }
  }

  cacheEl.querySelector(".controls").addEventListener("click", (e) => {
    const act = e.target.closest("button")?.dataset.act;
    if (!act) return;
    cLog.rule();
    if (act === "get") {
      const flash = {};
      let total = 2;
      const plain = [], tech = [];
      for (const [id, k] of Object.entries(KEYS)) {
        if (alive(k)) {
          flash[id] = "hit"; total += 1;
          plain.push(`${k.label} <span class="ok">from copy</span>`);
          tech.push(`${id} <span class="ok">HIT</span>`);
        } else {
          flash[id] = "miss"; total += k.cost; k.at = now;
          plain.push(`${k.label} <span class="acc">from database</span>`);
          tech.push(`${id} <span class="acc">MISS +${k.cost}ms db</span>`);
        }
      }
      const allHit = Object.values(flash).every((f) => f === "hit");
      cLog.line(
        `<span class="in">→ Home screen opened.</span>  ${plain.join(", ")}`,
        `<span class="in">→ GET /home</span>   ${tech.join("   ")}`
      );
      cLog.line(
        `<span class="ok">← Loaded in ${total} ms.</span> <span class="dim">${allHit ? "The database wasn't touched." : "Fresh results are saved as copies for next time."}</span>`,
        `<span class="ok">← 200 OK</span>  ${total}ms  <span class="dim">${allHit ? "0 db queries" : "misses written back to cache"}</span>`
      );
      paint(flash);
    } else if (act === "edit") {
      KEYS.banners.at = null;
      cLog.line(
        `<span class="in">→ Admin changed a banner.</span> Only the banner copy is thrown away, so the next visitor sees the new one.`,
        `<span class="in">→ PATCH /admin/banners/7</span>\n  post_save(Banner) → <span class="acc">DEL home:banners</span>   <span class="dim">other keys untouched</span>`
      );
      paint({ banners: "gone" });
    } else if (act === "t10m" || act === "t12h") {
      const add = act === "t10m" ? 10 : 720;
      now += add;
      const expired = Object.values(KEYS).filter((k) => k.at !== null && !alive(k) && now - add - k.at < k.ttl);
      cLog.line(
        `<span class="dim">${fmt(add)} pass.</span> ${expired.length ? `<span class="bad">Expired:</span> ${expired.map((k) => k.label).join(", ")}, so it'll be fetched fresh next time.` : `<span class="dim">Nothing expired.</span>`}`,
        `<span class="dim"># +${fmt(add)}</span> ${expired.length ? `<span class="bad">TTL expired:</span> ${expired.map((k) => k.name).join(", ")}` : `<span class="dim">no expiries</span>`}`
      );
      paint();
    }
  });
  paint();
})();
