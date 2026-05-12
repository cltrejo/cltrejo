import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const PALETTES = {
  light: {
    label: "#FFFFFF",
    empty: "#C9B6FF",
    petals: ["", "#FFD6E7", "#FFC1D6", "#FF8FBE", "#FF6FA3"],
    centers: ["", "#FFE8A8", "#FFD978", "#FFC857", "#FFB347"],
  },
  dark: {
    label: "#FFFFFF",
    empty: "#8F7BE8",
    petals: ["", "#FFD6E7", "#FFC1D6", "#FF8FBE", "#FF6FA3"],
    centers: ["", "#FFE8A8", "#FFD978", "#FFC857", "#FFB347"],
  },
};

function getLevel(count) {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 9) return 3;
  return 4;
}

function flower(cx, cy, level, palette) {
  let out = `<g transform="translate(${cx},${cy})">`;
  for (let a = 0; a < 5; a += 1) {
    out += `<ellipse cx="0" cy="-3.2" rx="2.2" ry="3.5" fill="${palette.petals[level]}" transform="rotate(${a * 72})"/>`;
  }
  out += `<circle cx="0" cy="0" r="1.8" fill="${palette.centers[level]}"/></g>`;
  return out;
}

function generateSVG(weeks, theme) {
  const palette = PALETTES[theme];
  const cellSize = 11;
  const gap = 2;
  const step = cellSize + gap;
  const paddingLeft = 28;
  const paddingTop = 32;
  const paddingRight = 20;
  const paddingBottom = 20;
  const graphW = weeks.length * step;
  const width = graphW + paddingLeft + paddingRight;
  const height = 7 * step + paddingTop + paddingBottom;

  let cells = "";
  const monthMarkers = [];
  let lastMonth = -1;
  let lastLabelWeek = -10;

  weeks.forEach((week, weekIndex) => {
    const firstDay = week.contributionDays.find((day) => day.date);
    if (firstDay) {
      const date = new Date(firstDay.date);
      const month = date.getMonth();
      const dayOfMonth = date.getDate();
      if (month !== lastMonth && dayOfMonth <= 7 && weekIndex - lastLabelWeek > 2) {
        monthMarkers.push({ month, weekIndex });
        lastMonth = month;
        lastLabelWeek = weekIndex;
      }
    }

    week.contributionDays.forEach((day) => {
      const dayOfWeek = new Date(day.date).getDay();
      const x = paddingLeft + weekIndex * step;
      const y = paddingTop + dayOfWeek * step;
      const level = getLevel(day.contributionCount);

      if (level > 0) {
        cells += flower(x + cellSize / 2, y + cellSize / 2, level, palette);
      } else {
        cells += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="2" fill="transparent" stroke="${palette.empty}" stroke-width="0.8"/>`;
      }
    });
  });

  const monthLabels = monthMarkers
    .map(({ month, weekIndex }) => {
      const x = paddingLeft + weekIndex * step;
      return `<text x="${x}" y="${paddingTop - 8}" font-size="9" fill="${palette.label}" font-family="monospace">${MONTHS[month]}</text>`;
    })
    .join("");

  const dayLabels = ["", "Mon", "", "Wed", "", "Fri", ""]
    .map((day, index) => {
      if (!day) return "";
      const y = paddingTop + index * step + cellSize - 2;
      return `<text x="${paddingLeft - 4}" y="${y}" font-size="8" fill="${palette.label}" font-family="monospace" text-anchor="end">${day}</text>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" rx="10" fill="transparent"/>
  ${monthLabels}
  ${dayLabels}
  ${cells}
</svg>`;
}

async function fetchContributions(username, token) {
  const today = new Date();
  const oneYearAgo = new Date(today);
  oneYearAgo.setDate(today.getDate() - 365);

  const query = `
    query($username: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $username) {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            weeks {
              contributionDays {
                contributionCount
                date
              }
            }
          }
        }
      }
    }
  `;

  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables: {
        username,
        from: oneYearAgo.toISOString(),
        to: today.toISOString(),
      },
    }),
  });

  const data = await response.json();
  if (data.errors || !data.data?.user) {
    throw new Error(`Could not fetch contributions for ${username}.`);
  }

  return data.data.user.contributionsCollection.contributionCalendar.weeks;
}

async function main() {
  const username = process.env.SAKURA_USERNAME || process.env.GITHUB_REPOSITORY_OWNER || "cltrejo";
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    throw new Error("Missing GITHUB_TOKEN.");
  }

  const weeks = await fetchContributions(username, token);
  const outDir = resolve("dist");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "sakura-garden.svg"), generateSVG(weeks, "light"));
  writeFileSync(resolve(outDir, "sakura-garden-dark.svg"), generateSVG(weeks, "dark"));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
