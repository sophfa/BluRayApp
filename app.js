const app = document.querySelector("#app");
const navLinks = [...document.querySelectorAll("[data-route]")];
const basePath = window.__APP_BASE_PATH__ || "";

const routes = {
  "/": {
    title: "Home",
    html: `
      <section class="card card--primary">
        <p class="label">Ready now</p>
        <h2>Deploy a real SPA without a build step</h2>
        <p>
          This repo ships as static assets, so GitHub Pages can publish it
          directly from a workflow with no extra tooling.
        </p>
      </section>
      <section class="card-grid">
        <article class="card">
          <h3>Single-page routing</h3>
          <p>Navigation is handled on the client with History API routes.</p>
        </article>
        <article class="card">
          <h3>Deep-link support</h3>
          <p>
            <code>404.html</code> redirects unmatched paths back into the SPA
            entry point.
          </p>
        </article>
        <article class="card">
          <h3>Direct deployment</h3>
          <p>
            Pushing to <code>main</code> triggers the Pages workflow
            automatically.
          </p>
        </article>
      </section>
    `,
  },
  "/features": {
    title: "Features",
    html: `
      <section class="card">
        <p class="label">What is configured</p>
        <h2>Pages-specific setup is already handled</h2>
        <ul class="feature-list">
          <li>Automatic base path injection during deployment</li>
          <li>Pages Actions workflow using the official GitHub actions</li>
          <li>Static assets you can edit in place</li>
          <li>Responsive layout suitable as a starter shell</li>
        </ul>
      </section>
    `,
  },
  "/deploy": {
    title: "Deploy",
    html: `
      <section class="card">
        <p class="label">Next steps</p>
        <h2>Push this repo to GitHub</h2>
        <ol class="steps">
          <li>Create an empty repository on GitHub.</li>
          <li>Add it as <code>origin</code>.</li>
          <li>Push the <code>main</code> branch.</li>
          <li>Enable GitHub Actions as the Pages source.</li>
        </ol>
      </section>
    `,
  },
};

function normalizeRoute(pathname) {
  let route = pathname;

  if (basePath && route.startsWith(basePath)) {
    route = route.slice(basePath.length) || "/";
  }

  if (!route.startsWith("/")) {
    route = "/" + route;
  }

  route = route.replace(/\/+$/, "");

  return route || "/";
}

function withBasePath(route) {
  if (route === "/") {
    return (basePath || "") + "/";
  }

  return (basePath || "") + route;
}

function render() {
  const route = normalizeRoute(window.location.pathname);
  const view = routes[route] || {
    title: "Not Found",
    html: `
      <section class="card">
        <p class="label">Missing route</p>
        <h2>That page does not exist.</h2>
        <p>Use the navigation above to return to a valid route.</p>
      </section>
    `,
  };

  document.title = `${view.title} | BluRayApp`;
  app.innerHTML = view.html;

  navLinks.forEach((link) => {
    const targetRoute = normalizeRoute(link.dataset.route || "/");
    const active = targetRoute === route;

    link.href = withBasePath(targetRoute);

    if (active) {
      link.setAttribute("aria-current", "page");
      return;
    }

    link.removeAttribute("aria-current");
  });
}

function navigate(route) {
  window.history.pushState(null, "", withBasePath(route));
  render();
}

document.addEventListener("click", (event) => {
  const link = event.target.closest("[data-route]");

  if (!link) {
    return;
  }

  event.preventDefault();
  navigate(normalizeRoute(link.dataset.route || "/"));
});

window.addEventListener("popstate", render);

render();
