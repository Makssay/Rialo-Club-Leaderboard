let rawData = [];
let data = [];
let allTweets = [];
let sortKey = "posts";
let sortOrder = "desc";
let currentPage = 1;
const perPage = 15;
let timeFilter = "all";

// --- Fetch leaderboard data ---
async function fetchData() {
  try {
    const response = await fetch("/leaderboard");
    const json = await response.json();
    rawData = json;
    normalizeData(rawData);
    sortData();
    renderTable();
    updateArrows();
    updateTotals();
  } catch (err) {
    console.error("Failed to fetch leaderboard:", err);
  }
}

// --- Fetch all tweets ---
async function fetchTweets() {
  try {
    const response = await fetch("/all_tweets");
    const json = await response.json();
    // приводим к массиву (если пришёл одиночный объект)
    if (Array.isArray(json)) {
      allTweets = json;
    } else if (json && typeof json === "object") {
      // если объект, но возможно внутри есть ключи с твитами, либо это единичный твит
      // попробуем найти очевидные контейнеры
      if (Array.isArray(json.tweets)) {
        allTweets = json.tweets;
      } else if (Array.isArray(json.data)) {
        allTweets = json.data;
      } else {
        // считаем это одним твитом
        allTweets = [json];
      }
    } else {
      allTweets = [];
    }
  } catch (err) {
    console.error("Failed to fetch all tweets:", err);
    allTweets = [];
  }
}

// стартовые загрузки
fetchTweets().then(() => {
  // сначала подтянем твиты, потом лидерборд (чтобы фильтр по времени работал сразу)
  fetchData();
});
setInterval(() => {
  fetchTweets();
  fetchData();
}, 3600000); // обновлять каждый час (как было)

// --- Normalize leaderboard data (robust) ---
function normalizeData(json) {
  data = [];

  // вспомог: получить username/stat из разных форматов leaderboard.json
  if (Array.isArray(json) && json.length > 0 && typeof json[0] === "object" && !Array.isArray(json[0])) {
    // массив объектов [{ username, posts, ... }, ...]
    data = json.map(item => extractBaseStatsFromItem(item));
  } else if (Array.isArray(json) && json.length > 0 && Array.isArray(json[0])) {
    // массив пар [name, stats]
    data = json.map(([name, stats]) => {
      const base = extractBaseStatsFromItem(stats || {});
      base.username = name || base.username || "";
      return applyTimeFilterIfNeeded(base);
    });
  } else if (json && typeof json === "object" && !Array.isArray(json)) {
    // объект { username: stats, ... }
    data = Object.entries(json).map(([name, stats]) => {
      const base = extractBaseStatsFromItem(stats || {});
      base.username = name || base.username || "";
      return applyTimeFilterIfNeeded(base);
    });
  } else {
    data = [];
  }

  // Если ранее branch for array of objects didn't apply apply time filter now
  // (the extract function returns already applied base stats; but ensure timeFilter applied)
  if (Array.isArray(data)) {
    data = data.map(d => applyTimeFilterIfNeeded(d));
  }

  // helper inside
  function extractBaseStatsFromItem(item) {
    // поддерживаем разные ключи
    const username = item.username || item.user || item.name || item.screen_name || "";
    const posts = Number(item.posts || item.tweets || 0);
    const likes = Number(item.likes || item.favorite_count || item.favourites_count || 0);
    const retweets = Number(item.retweets || item.retweet_count || 0);
    const comments = Number(item.comments || item.reply_count || 0);
    const views = Number(item.views || item.views_count || item.view_count || item.impression_count || 0);

    return { username, posts, likes, retweets, comments, views };
  }

  // применяем фильтр по времени к записи (если нужно)
  function applyTimeFilterIfNeeded(base) {
    if (!base || !base.username) return base;
    if (timeFilter === "all") return base;

    const days = Number(timeFilter);
    if (!days || days <= 0) return base;

    const now = new Date();
    // найдем твиты пользователя — будем матчить по screen_name и по имени без @
    const uname = String(base.username).toLowerCase().replace(/^@/, "");

    // все твиты, где tweet.user.screen_name совпадает (без учёта регистра)
    const userTweets = allTweets.filter(t => {
      const sn = (t.user && (t.user.screen_name || t.user.screen_name)) || t.user?.screen_name || t.user?.screen_name;
      // some tweets might use 'user.screen_name' or 'user.id_str' etc. We'll try screen_name and name
      const candidate = (t.user && (t.user.screen_name || t.user.name || t.user.screen_name)) || "";
      return String(candidate).toLowerCase().replace(/^@/, "") === uname;
    });

    // если не нашли — пробуем матчить по tweet.user.name
    const found = userTweets.length > 0 ? userTweets : allTweets.filter(t => {
      const candidate = (t.user && (t.user.name || "")) || "";
      return String(candidate).toLowerCase().replace(/^@/, "") === uname;
    });

    let posts = 0, likes = 0, retweets = 0, comments = 0, views = 0;

    found.forEach(tweet => {
      const created = tweet.tweet_created_at || tweet.created_at || tweet.created || null;
      if (!created) return;
      const tweetDate = new Date(created);
      if (isNaN(tweetDate)) return;
      const diffDays = (now - tweetDate) / (1000 * 60 * 60 * 24);
      if (diffDays <= days) {
        posts += 1;
        likes += Number(tweet.favorite_count || tweet.favourite_count || tweet.favourites_count || 0);
        retweets += Number(tweet.retweet_count || 0);
        comments += Number(tweet.reply_count || 0);
        views += Number(tweet.views_count || tweet.view_count || tweet.impression_count || 0);
      }
    });

    return {
      username: base.username,
      posts,
      likes,
      retweets,
      comments,
      views
    };
  }
}

// --- Update totals ---
function updateTotals() {
  const totalPosts = data.reduce((sum, s) => sum + (Number(s.posts) || 0), 0);
  const totalViews = data.reduce((sum, s) => sum + (Number(s.views) || 0), 0);
  document.getElementById("total-posts").textContent = `Total Posts: ${totalPosts}`;
  document.getElementById("total-users").textContent = `Total Users: ${data.length}`;
  document.getElementById("total-views").textContent = `Total Views: ${totalViews}`;
}

// --- Sort data ---
function sortData() {
  data.sort((a, b) => {
    const valA = Number(a[sortKey] || 0);
    const valB = Number(b[sortKey] || 0);
    return sortOrder === "asc" ? valA - valB : valB - valA;
  });
}

// --- Filter by search ---
function filterData() {
  const query = document.getElementById("search").value.toLowerCase();
  return data.filter(item => (item.username || "").toLowerCase().includes(query));
}

// --- Render table ---
function renderTable() {
  const tbody = document.getElementById("leaderboard-body");
  tbody.innerHTML = "";

  const filtered = filterData();
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * perPage;
  const pageData = filtered.slice(start, start + perPage);

  pageData.forEach(stats => {
    const name = stats.username || "";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(name)}</td>
      <td>${Number(stats.posts || 0)}</td>
      <td>${Number(stats.likes || 0)}</td>
      <td>${Number(stats.retweets || 0)}</td>
      <td>${Number(stats.comments || 0)}</td>
      <td>${Number(stats.views || 0)}</td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById("page-info").textContent = `Page ${currentPage} / ${totalPages}`;
}

// --- Escape HTML ---
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// --- Sorting ---
function updateSort(key) {
  if (sortKey === key) {
    sortOrder = sortOrder === "asc" ? "desc" : "asc";
  } else {
    sortKey = key;
    sortOrder = "desc";
  }
  sortData();
  renderTable();
  updateArrows();
}

function updateArrows() {
  document.querySelectorAll(".sort-arrow").forEach(el => el.textContent = "");
  const active = document.querySelector(`#${sortKey}-header .sort-arrow`) || document.querySelector(`#${sortKey}-col-header .sort-arrow`);
  if (active) active.textContent = sortOrder === "asc" ? "▲" : "▼";
  document.querySelectorAll("thead th").forEach(th => th.classList.remove("active"));
  const headerId = sortKey + (["views", "retweets", "comments"].includes(sortKey) ? "-col-header" : "-header");
  const headerEl = document.getElementById(headerId);
  if (headerEl) headerEl.classList.add("active");
}

// --- Pagination ---
document.getElementById("prev-page").onclick = () => {
  if (currentPage > 1) { currentPage--; renderTable(); }
};
document.getElementById("next-page").onclick = () => {
  const total = Math.ceil(filterData().length / perPage);
  if (currentPage < total) { currentPage++; renderTable(); }
};

// --- Search input ---
document.getElementById("search").addEventListener("input", () => {
  currentPage = 1;
  renderTable();
});

// --- Sorting headers ---
document.getElementById("posts-header").addEventListener("click", () => updateSort("posts"));
document.getElementById("likes-header").addEventListener("click", () => updateSort("likes"));
document.getElementById("retweets-header").addEventListener("click", () => updateSort("retweets"));
document.getElementById("comments-header").addEventListener("click", () => updateSort("comments"));
document.getElementById("views-col-header").addEventListener("click", () => updateSort("views"));

// --- Time filter control ---
document.getElementById("time-select").addEventListener("change", (e) => {
  timeFilter = e.target.value || "all";
  currentPage = 1;
  // перерасчёт с учётом нового фильтра
  normalizeData(rawData);
  sortData();
  renderTable();
  updateTotals();
});
