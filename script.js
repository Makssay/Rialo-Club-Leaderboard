/* ===============================
   GLOBAL STATE
================================= */

let leaderboardBase = [];
let leaderboardData = [];
let allTweets = [];

let sortKey = "posts";
let sortOrder = "desc";

let currentPage = 1;
const perPage = 15;
let timeFilter = "all";

let analyticsPeriod = "all";
let analyticsChart = null;

/* ===============================
   HELPERS
================================= */

function parseDateSafe(val) {
    if (!val) return null;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
}

function daysDiff(a, b) {
    return (b - a) / (1000 * 60 * 60 * 24);
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

/* ===============================
   FETCH DATA
================================= */

async function fetchLeaderboard() {
    try {
        const res = await fetch("leaderboard.json");
        const data = await res.json();
        leaderboardBase = normalizeLeaderboard(data);
    } catch (e) {
        console.error("Failed to load leaderboard.json", e);
        leaderboardBase = [];
    }
}

async function fetchTweets() {
    try {
        const res = await fetch("all_tweets.json");
        const json = await res.json();
        if (Array.isArray(json)) allTweets = json;
        else if (Array.isArray(json.tweets)) allTweets = json.tweets;
        else if (Array.isArray(json.data)) allTweets = json.data;
        else allTweets = [];
    } catch (e) {
        console.error("Failed to load all_tweets.json", e);
        allTweets = [];
    }
}

/* Normalize different possible formats */
function normalizeLeaderboard(raw) {
    if (!raw) return [];

    const arr = [];

    /* Format A: [[username, stats], ...] */
    if (Array.isArray(raw) && raw.length && Array.isArray(raw[0])) {
        raw.forEach(([name, s]) => {
            if (!name || !s) return;
            arr.push({
                username: name,
                posts: Number(s.posts || 0),
                likes: Number(s.likes || 0),
                retweets: Number(s.retweets || 0),
                comments: Number(s.comments || 0),
                views: Number(s.views || 0),
            });
        });
        return arr;
    }

    /* Format B: [{ username, posts, ...}] */
    if (Array.isArray(raw)) {
        raw.forEach((obj) => {
            if (!obj) return;
            const name = obj.username || obj.user || obj.screen_name || "";
            if (!name) return;
            arr.push({
                username: name,
                posts: Number(obj.posts || obj.tweets || 0),
                likes: Number(obj.likes || obj.favorite_count || 0),
                retweets: Number(obj.retweets || obj.retweet_count || 0),
                comments: Number(obj.comments || obj.reply_count || 0),
                views: Number(obj.views || obj.views_count || 0),
            });
        });
        return arr;
    }

    /* Format C: { username: stats } */
    if (typeof raw === "object") {
        Object.entries(raw).forEach(([name, s]) => {
            if (!s) return;
            arr.push({
                username: name,
                posts: Number(s.posts || 0),
                likes: Number(s.likes || 0),
                retweets: Number(s.retweets || 0),
                comments: Number(s.comments || 0),
                views: Number(s.views || 0),
            });
        });
    }

    return arr;
}

/* ===============================
   LEADERBOARD LOGIC
================================= */

function aggregateUserFromTweets(username, days) {
    const now = new Date();
    const uname = username.toLowerCase().replace(/^@/, "");

    let posts = 0,
        likes = 0,
        retweets = 0,
        comments = 0,
        views = 0;

    allTweets.forEach((t) => {
        const user = (t.user && (t.user.screen_name || t.user.name)) || "";
        const clean = String(user).toLowerCase().replace(/^@/, "");
        if (uname !== clean) return;

        const created = parseDateSafe(
            t.created_at || t.tweet_created_at || t.created
        );
        if (!created) return;

        if (days !== "all") {
            if (daysDiff(created, now) > Number(days)) return;
        }

        posts++;
        likes += Number(t.favorite_count || 0);
        retweets += Number(t.retweet_count || 0);
        comments += Number(t.reply_count || 0);
        views += Number(t.views_count || 0);
    });

    return { posts, likes, retweets, comments, views };
}

function recomputeLeaderboard() {
    leaderboardData = leaderboardBase.map((row) => {
        if (timeFilter === "all") return { ...row };
        const a = aggregateUserFromTweets(row.username, timeFilter);
        return { username: row.username, ...a };
    });

    sortLeaderboard();
    renderTotals();
    renderTable();
}

function sortLeaderboard() {
    leaderboardData.sort((a, b) => {
        const A = Number(a[sortKey] || 0);
        const B = Number(b[sortKey] || 0);
        return sortOrder === "asc" ? A - B : B - A;
    });
}

function filteredLeaderboard() {
    const q = document.getElementById("search").value.toLowerCase();
    if (!q) return leaderboardData;
    return leaderboardData.filter((r) =>
        r.username.toLowerCase().includes(q)
    );
}

function renderTotals() {
    const totalPosts = leaderboardData.reduce((s, r) => s + r.posts, 0);
    const totalViews = leaderboardData.reduce((s, r) => s + r.views, 0);

    document.getElementById(
        "total-posts"
    ).textContent = `Total Posts: ${totalPosts}`;
    document.getElementById(
        "total-users"
    ).textContent = `Total Users: ${leaderboardData.length}`;
    document.getElementById(
        "total-views"
    ).textContent = `Total Views: ${totalViews}`;
}

function renderTable() {
    const tbody = document.getElementById("leaderboard-body");
    tbody.innerHTML = "";

    const filtered = filteredLeaderboard();
    const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * perPage;
    const slice = filtered.slice(start, start + perPage);

    slice.forEach((row) => {
        const tr = document.createElement("tr");
        tr.dataset.username = row.username;

        tr.innerHTML = `
            <td>${escapeHtml(row.username)}</td>
            <td>${row.posts}</td>
            <td>${row.likes}</td>
            <td>${row.retweets}</td>
            <td>${row.comments}</td>
            <td>${row.views}</td>
        `;

        tr.addEventListener("click", () => toggleTweetsRow(tr, row.username));
        tbody.appendChild(tr);
    });

    document.getElementById(
        "page-info"
    ).textContent = `Page ${currentPage} / ${totalPages}`;

    updateSortArrows();
}

/* ===============================
   TWEETS INSIDE TABLE
================================= */

function getTweetsForUser(username, days) {
    const uname = username.toLowerCase().replace(/^@/, "");
    const now = new Date();

    return allTweets.filter((t) => {
        const u = (t.user && (t.user.screen_name || t.user.name)) || "";
        const clean = u.toLowerCase().replace(/^@/, "");
        if (clean !== uname) return false;

        const created = parseDateSafe(
            t.created_at || t.tweet_created_at || t.created
        );
        if (!created) return false;

        if (days !== "all") {
            if (daysDiff(created, now) > Number(days)) return false;
        }

        return true;
    });
}

function toggleTweetsRow(tr, username) {
    const tbody = tr.parentElement;

    // Если уже открыт – закрываем
    const next = tr.nextElementSibling;
    if (next && next.classList.contains("tweets-row")) {
        next.remove();
        tr.classList.remove("active-row");
        return;
    }

    // Закрываем другие строки
    tbody.querySelectorAll(".tweets-row").forEach((r) => r.remove());
    tbody.querySelectorAll("tr").forEach((r) => r.classList.remove("active-row"));

    tr.classList.add("active-row");

    const row = document.createElement("tr");
    row.classList.add("tweets-row");
    const td = document.createElement("td");
    td.colSpan = 6;

    const tweets = getTweetsForUser(username, timeFilter);

    if (!tweets.length) {
        td.innerHTML = "<i>No tweets for this period.</i>";
        row.appendChild(td);
        tr.insertAdjacentElement("afterend", row);

        // плавный fade-in для пустой гармошки
        row.style.opacity = "0";
        row.style.transform = "translateY(6px)";
        requestAnimationFrame(() => {
            row.style.transition = "opacity 0.25s ease, transform 0.25s ease";
            row.style.opacity = "1";
            row.style.transform = "translateY(0)";
        });

        return;
    }

    const wrap = document.createElement("div");
    wrap.classList.add("tweet-container");

    tweets.forEach((t) => {
        const text = t.text || "";
        const user = (t.user && (t.user.screen_name || t.user.name)) || username;
        const id = t.id_str || t.id;
        const tweetUrl = `https://x.com/${user}/status/${id}`;

        const created = parseDateSafe(
            t.created_at || t.tweet_created_at || t.created
        );
        const dateStr = created
            ? created.toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
              })
            : "";

        // --- MEDIA EXTRACTION ---
        const mediaUrls = [];

        // Twitter entities
        if (t.entities && t.entities.media) {
            t.entities.media.forEach((m) => {
                if (m.media_url_https) mediaUrls.push(m.media_url_https);
                else if (m.media_url) mediaUrls.push(m.media_url);
            });
        }

        // Extended media
        if (t.extended_entities && t.extended_entities.media) {
            t.extended_entities.media.forEach((m) => {
                if (m.media_url_https) mediaUrls.push(m.media_url_https);
                else if (m.media_url) mediaUrls.push(m.media_url);
            });
        }

        // YOUR REAL FORMAT: t.media[]
        if (Array.isArray(t.media)) {
            t.media.forEach((m) => {
                if (m.url) {
                    mediaUrls.push(m.url);
                }
            });
        }


        // YOUR REAL FORMAT: t.media[]
        if (Array.isArray(t.media)) {
            t.media.forEach((m) => {
                if (m.media_url_https) mediaUrls.push(m.media_url_https);
                else if (m.media_url) mediaUrls.push(m.media_url);
            });
        }

        let mediaHtml = "";
        if (mediaUrls.length > 0) {
            const cls =
                mediaUrls.length === 1 ? "one" :
                mediaUrls.length === 2 ? "two" :
                mediaUrls.length === 3 ? "three" : "four";

            mediaHtml = `
                <div class="tweet-media ${cls}">
                    ${mediaUrls
                        .slice(0, 4)
                        .map(
                            (url) => `
                        <img src="${url}" class="tweet-img" loading="lazy">
                    `
                        )
                        .join("")}
                </div>
            `;
        }

        // --- BUILD CARD ---
        const card = document.createElement("div");
        card.classList.add("tweet-card");

        card.innerHTML = `
            <div class="tweet-clickable">
                <p class="tweet-text">${escapeHtml(text)}</p>
                ${mediaHtml}
                <div class="tweet-meta">
                    <span>${dateStr}</span>
                    <span>❤️ ${t.favorite_count || 0} · 👁 ${t.views_count || 0}</span>
                </div>
            </div>
        `;

        // Вся карточка кликабельна
        card.addEventListener("click", () => {
            window.open(tweetUrl, "_blank");
        });

        // === FIX: глитч картинок + красивая анимация появления карточек ===
        card.style.opacity = "0";
        card.style.transform = "translateY(4px)";

        const imgs = card.querySelectorAll("img");
        let loaded = 0;

        function showCard() {
            requestAnimationFrame(() => {
                card.style.transition = "opacity 0.25s ease, transform 0.25s ease";
                card.style.opacity = "1";
                card.style.transform = "translateY(0)";
            });
        }

        if (imgs.length === 0) {
            // без медиа — показываем сразу
            showCard();
        } else {
            imgs.forEach((img) => {
                const done = () => {
                    loaded++;
                    if (loaded === imgs.length) {
                        showCard();
                    }
                };

                if (img.complete) {
                    // уже загружено (кэш)
                    done();
                } else {
                    img.addEventListener("load", done, { once: true });
                    img.addEventListener("error", done, { once: true });
                }
            });
        }

        wrap.appendChild(card);
    });

    td.appendChild(wrap);
    row.appendChild(td);
    tr.insertAdjacentElement("afterend", row);

    // плавный fade-in всей гармошки
    row.style.opacity = "0";
    row.style.transform = "translateY(6px)";
    requestAnimationFrame(() => {
        row.style.transition = "opacity 0.25s ease, transform 0.25s ease";
        row.style.opacity = "1";
        row.style.transform = "translateY(0)";
    });
}

/* ===============================
   SORTING ARROWS
================================= */

function updateSortArrows() {
    document.querySelectorAll(".sort-arrow").forEach((el) => (el.textContent = ""));
    const id = sortKey === "views" ? "views-col-header" : `${sortKey}-header`;
    const th = document.getElementById(id);
    const arrow = th.querySelector(".sort-arrow");
    arrow.textContent = sortOrder === "asc" ? "▲" : "▼";
}

/* ===============================
   ANALYTICS CORE LOGIC
================================= */

function buildAnalyticsStats(period) {
    const now = new Date();
    const days = period === "all" ? null : Number(period);

    const userStats = new Map();
    const tweetsByDay = new Map();
    const tweetList = [];

    allTweets.forEach((t) => {
        const created = parseDateSafe(
            t.created_at || t.tweet_created_at || t.created
        );
        if (!created) return;
        if (days !== null && daysDiff(created, now) > days) return;

        const user = (t.user && (t.user.screen_name || t.user.name)) || "unknown";
        const uname = String(user);

        const likes = Number(t.favorite_count || 0);
        const views = Number(t.views_count || 0);
        const retweets = Number(t.retweet_count || 0);
        const comments = Number(t.reply_count || 0);

        if (!userStats.has(uname)) {
            userStats.set(uname, {
                posts: 0,
                likes: 0,
                views: 0,
                retweets: 0,
                comments: 0,
            });
        }

        const st = userStats.get(uname);
        st.posts++;
        st.likes += likes;
        st.views += views;
        st.retweets += retweets;
        st.comments += comments;

        const dayKey = created.toISOString().slice(0, 10);
        tweetsByDay.set(dayKey, (tweetsByDay.get(dayKey) || 0) + 1);

        tweetList.push({
            user: uname,
            text: t.text || "",
            likes,
            views,
            created,
            id: t.id_str || t.id,
        });
    });

    return { userStats, tweetsByDay, tweetList };
}

function renderAnalytics() {
    const { userStats, tweetsByDay, tweetList } =
        buildAnalyticsStats(analyticsPeriod);

    /* KPIs */
    const usersCount = userStats.size || 1;
    let posts = 0,
        likes = 0,
        views = 0;
    userStats.forEach((s) => {
        posts += s.posts;
        likes += s.likes;
        views += s.views;
    });

    document.querySelector("#avg-posts .kpi-value").textContent = (
        posts / usersCount
    ).toFixed(1);
    document.querySelector("#avg-likes .kpi-value").textContent = (
        likes / usersCount
    ).toFixed(1);
    document.querySelector("#avg-views .kpi-value").textContent = (
        views / usersCount
    ).toFixed(1);

    /* GRAPH */
    const labels = [...tweetsByDay.keys()].sort();
    const data = labels.map((k) => tweetsByDay.get(k));

    const ctx = document
        .getElementById("analytics-chart")
        .getContext("2d");
    if (analyticsChart) analyticsChart.destroy();

    analyticsChart = new Chart(ctx, {
        type: "line",
        data: {
            labels,
            datasets: [
                {
                    label: "Tweets",
                    data,
                    borderWidth: 2,
                    tension: 0.35,
                    fill: true,
                    borderColor: "rgba(230,238,255,0.9)",
                    backgroundColor: "rgba(230,238,255,0.12)",
                    pointRadius: 3,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: "#fff" } },
            },
            scales: {
                x: {
                    ticks: { color: "#cdd7ff" },
                    grid: { color: "rgba(255,255,255,0.06)" },
                },
                y: {
                    ticks: { color: "#cdd7ff" },
                    grid: { color: "rgba(255,255,255,0.06)" },
                },
            },
        },
    });

    renderTopAuthors(userStats);
    renderTopPosts(tweetList);
}

function renderTopAuthors(userStats) {
    const metric = document.getElementById("author-metric-select").value;
    const arr = [...userStats.entries()].map(([u, s]) => ({
        username: u,
        ...s,
    }));

    arr.sort((a, b) => Number(b[metric]) - Number(a[metric]));
    const top = arr.slice(0, 10);

    const list = document.getElementById("top-authors-list");
    list.innerHTML = "";

    top.forEach((x, i) => {
        const li = document.createElement("li");
        li.innerHTML = `
            <div class="author-row">
                <div class="author-name">${i + 1}. ${escapeHtml(
            x.username
        )}</div>
                <div class="author-metric">${metric}: ${x[metric]}</div>
            </div>
            <div class="author-stats">
                ⭐ Posts: ${x.posts} · ❤️ Likes: ${x.likes} · 🔁 Retweets: ${
            x.retweets
        } · 👁 Views: ${x.views}
            </div>
        `;
        list.appendChild(li);
    });
}

function renderTopPosts(tweetList) {
    const metric = document.getElementById("post-metric-select").value;

    const sorted = [...tweetList].sort(
        (a, b) => Number(b[metric]) - Number(a[metric])
    );

    const top = sorted.slice(0, 10);
    const list = document.getElementById("top-posts-list");
    list.innerHTML = "";

    top.forEach((t) => {
        const textShort =
            t.text.length > 160 ? t.text.slice(0, 157) + "..." : t.text;
        const dateStr = t.created
            ? t.created.toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
              })
            : "";

        const li = document.createElement("li");
        li.innerHTML = `
            <a href="https://x.com/${t.user}/status/${t.id}" target="_blank">
                <div class="post-meta">
                    <span><strong>${escapeHtml(t.user)}</strong></span>
                    <span>${dateStr}</span>
                </div>
                <div class="post-text">${escapeHtml(textShort)}</div>
                <div class="post-meta">
                    <span>❤️ ${t.likes}</span>
                    <span>👁 ${t.views}</span>
                </div>
            </a>
        `;
        list.appendChild(li);
    });
}

/* ===============================
   UI CONTROLS + ANIMATIONS
================================= */

function setupTabs() {
    const buttons = document.querySelectorAll(".tab-btn");
    const views = document.querySelectorAll(".tab-view");

    buttons.forEach((btn) => {
        btn.addEventListener("click", () => {
            const tab = btn.dataset.tab;

            buttons.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");

            views.forEach((v) =>
                v.classList.toggle("active", v.id === `tab-${tab}`)
            );
        });
    });

    /* Analytics inner tabs */
    const innerBtns = document.querySelectorAll(".analytics-tab-btn");
    const innerSections = document.querySelectorAll(".analytics-section");

    innerBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
            const tab = btn.dataset.analyticsTab;

            innerBtns.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");

            innerSections.forEach((sec) =>
                sec.classList.toggle(
                    "active",
                    sec.dataset.analyticsSection === tab
                )
            );
        });
    });
}

function setupControls() {
    /* Search */
    document.getElementById("search").addEventListener("input", () => {
        currentPage = 1;
        renderTable();
    });

    /* Time filter (leaderboard) */
    document.getElementById("time-select").addEventListener("change", (e) => {
        timeFilter = e.target.value;
        currentPage = 1;
        recomputeLeaderboard();
    });

    /* Pagination */
    document.getElementById("prev-page").addEventListener("click", () => {
        if (currentPage > 1) {
            currentPage--;
            renderTable();
        }
    });

    document.getElementById("next-page").addEventListener("click", () => {
        const total = Math.ceil(filteredLeaderboard().length / perPage);
        if (currentPage < total) {
            currentPage++;
            renderTable();
        }
    });

    /* ANALYTICS PERIOD — FADE ANIMATION */
    document
        .getElementById("analytics-time-select")
        .addEventListener("change", (e) => {
            const content = document.querySelector(".analytics-content");
            if (content) {
                content.classList.add("fade-out");
            }

            setTimeout(() => {
                analyticsPeriod = e.target.value;
                renderAnalytics();
                if (content) {
                    content.classList.remove("fade-out");
                }
            }, 150);
        });

    /* SORT BUTTONS */
    ["posts", "likes", "retweets", "comments", "views"].forEach((key) => {
        const id = key === "views" ? "views-col-header" : `${key}-header`;
        document.getElementById(id).addEventListener("click", () => {
            if (sortKey === key)
                sortOrder = sortOrder === "asc" ? "desc" : "asc";
            else {
                sortKey = key;
                sortOrder = "desc";
            }
            sortLeaderboard();
            renderTable();
        });
    });

    /* Analytics selects (metric selectors) */
    document
        .getElementById("author-metric-select")
        .addEventListener("change", renderAnalytics);
    document
        .getElementById("post-metric-select")
        .addEventListener("change", renderAnalytics);

    setupPlayer();
}

/* ===============================
   MUSIC PLAYER
================================= */

function setupPlayer() {
    const player = document.getElementById("player");
    const playBtn = document.getElementById("play-btn");
    const status = document.getElementById("radio-status");
    const volume = document.getElementById("volume-slider");

    if (!player || !playBtn || !status || !volume) return;

    player.volume = Number(volume.value);

    playBtn.addEventListener("click", () => {
        if (player.paused) {
            player.play();
            playBtn.textContent = "⏸";
            status.textContent = "broadcasting";
        } else {
            player.pause();
            playBtn.textContent = "▶";
            status.textContent = "signal idle";
        }
    });

    volume.addEventListener("input", () => {
        player.volume = Number(volume.value);
    });
}

/* ===============================
   INIT
================================= */

document.addEventListener("DOMContentLoaded", async () => {
    setupTabs();
    setupControls();

    await fetchTweets();
    await fetchLeaderboard();

    recomputeLeaderboard();
    renderAnalytics();

    /* AUTO-REFRESH EACH HOUR */
    setInterval(async () => {
        await fetchTweets();
        await fetchLeaderboard();
        recomputeLeaderboard();
        renderAnalytics();
    }, 3600000);
});
