(() => {
  const DEFAULT_CONFIG = {
    apiBase: "https://csl860x2oj.execute-api.us-east-2.amazonaws.com/prod",
    sourceId: "docs-tenstorrent",
    siteBaseUrl: "https://firdovsimammedovk.github.io/tt-metal/",
  };

  function getConfig() {
    const runtimeConfig = window.TT_DOCS_REMOTE_SEARCH || {};
    return {
      apiBase: runtimeConfig.apiBase || DEFAULT_CONFIG.apiBase,
      sourceId: runtimeConfig.sourceId || DEFAULT_CONFIG.sourceId,
      siteBaseUrl: runtimeConfig.siteBaseUrl || DEFAULT_CONFIG.siteBaseUrl,
    };
  }

  function normalizeUrl(rawUrl, siteBaseUrl) {
    if (!rawUrl) {
      return "#";
    }

    const siteBase = new URL(siteBaseUrl);

    try {
      const input = new URL(rawUrl, siteBaseUrl);
      if (input.hostname === "docs.tenstorrent.com") {
        return `${siteBase.origin}${input.pathname}${input.search}${input.hash}`;
      }
      return input.toString();
    } catch (_error) {
      return rawUrl;
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[<>&"]/g, (char) => {
      const table = { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" };
      return table[char] || char;
    });
  }

  function cleanTitle(title) {
    const raw = (title || "").trim();
    if (!raw) {
      return "";
    }
    return raw.replace(/\s+[—-]\s+.*documentation$/i, "").trim() || raw;
  }

  function getRelativePathLabel(url, siteBaseUrl) {
    try {
      const normalized = new URL(url, siteBaseUrl);
      const siteBase = new URL(siteBaseUrl);
      let path = normalized.pathname;
      const basePath = siteBase.pathname.replace(/\/+$/, "");
      if (basePath && path.startsWith(basePath)) {
        path = path.slice(basePath.length);
      }
      path = path.replace(/^\/+/, "");
      if (!path) {
        return "Home";
      }
      return decodeURIComponent(path);
    } catch (_error) {
      return "";
    }
  }

  function getSearchResultsUrl(query, apiBase, sourceId) {
    return `${apiBase.replace(/\/+$/, "")}/v1/search?q=${encodeURIComponent(query)}&source=${encodeURIComponent(sourceId)}`;
  }

  function renderRemoteSearch() {
    if (!window.location.pathname.endsWith("/search.html")) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const query = (params.get("q") || "").trim();
    const { apiBase, sourceId, siteBaseUrl } = getConfig();

    const resultsRoot = document.querySelector("#search-results");
    if (!resultsRoot) {
      return;
    }

    const escapedQuery = escapeHtml(query);
    resultsRoot.innerHTML = query
      ? `<p>Searching remotely for <strong>${escapedQuery}</strong>...</p>`
      : "<p>Enter a search term in the sidebar search box.</p>";

    if (!query) {
      return;
    }

    fetch(getSearchResultsUrl(query, apiBase, sourceId), { method: "GET" })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Remote search request failed (${response.status}).`);
        }
        return response.json();
      })
      .then((payload) => {
        const hits = Array.isArray(payload?.hits) ? payload.hits : [];
        const total = payload?.total?.value ?? hits.length;

        if (!hits.length) {
          resultsRoot.innerHTML = `<p>No remote search results for <strong>${escapedQuery}</strong>.</p>`;
          return;
        }

        const list = hits
          .map((hit) => {
            const rawUrl = hit?.url || "#";
            const normalizedUrl = normalizeUrl(rawUrl, siteBaseUrl);
            const href = normalizedUrl.replace(/"/g, "&quot;");
            const preferredTitle = cleanTitle(hit?.title);
            const fallbackTitle = getRelativePathLabel(normalizedUrl, siteBaseUrl) || "Untitled result";
            const title = escapeHtml(preferredTitle || fallbackTitle);
            const pathLabel = escapeHtml(getRelativePathLabel(normalizedUrl, siteBaseUrl));
            const source = hit?.source ? `<span class="remote-search-source">${escapeHtml(hit.source)}</span>` : "";
            return `<li><a href="${href}">${title}</a><div class="context">${pathLabel}${source}</div></li>`;
          })
          .join("");

        resultsRoot.innerHTML = `
          <p class="search-summary">Found <strong>${total}</strong> result(s) for <strong>${escapedQuery}</strong>.</p>
          <ul class="search remote-search-results">
            ${list}
          </ul>
        `;
      })
      .catch((error) => {
        resultsRoot.innerHTML = `<p>Remote search is unavailable right now. ${error.message}</p>`;
      });
  }

  document.addEventListener("DOMContentLoaded", () => {
    renderRemoteSearch();
  });
})();
