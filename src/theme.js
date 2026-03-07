function getSystemTheme() {
  if (!window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const THEME_STORAGE_KEY = "creditcombo-theme";
const THEME_SYSTEM_STORAGE_KEY = "creditcombo-theme-system";

function readStoredThemePreference() {
  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    const storedSystemTheme = window.localStorage.getItem(THEME_SYSTEM_STORAGE_KEY);

    if ((storedTheme !== "light" && storedTheme !== "dark") ||
      (storedSystemTheme !== "light" && storedSystemTheme !== "dark")) {
      return null;
    }

    return { theme: storedTheme, systemTheme: storedSystemTheme };
  } catch {
    return null;
  }
}

function persistThemePreference(theme, systemTheme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    window.localStorage.setItem(THEME_SYSTEM_STORAGE_KEY, systemTheme);
  } catch {
    // Ignore localStorage failures (privacy mode, disabled storage, etc.)
  }
}

function resolveInitialTheme() {
  const systemTheme = getSystemTheme();
  const storedPreference = readStoredThemePreference();

  if (!storedPreference) {
    persistThemePreference(systemTheme, systemTheme);
    return systemTheme;
  }

  if (storedPreference.systemTheme !== systemTheme) {
    persistThemePreference(systemTheme, systemTheme);
    return systemTheme;
  }

  return storedPreference.theme;
}

function applyTheme(theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;

  const themeToggle = document.querySelector("[data-theme-toggle]");
  if (!themeToggle) return;

  const nextTheme = theme === "dark" ? "light" : "dark";
  themeToggle.textContent = nextTheme === "light" ? "☀︎" : "☾";
  themeToggle.setAttribute("aria-label", `Switch to ${nextTheme} mode`);
  themeToggle.title = `Switch to ${nextTheme} mode`;
}


function randomInRange(min, max) {
  return min + (Math.random() * (max - min));
}

function randomSign() {
  return Math.random() < 0.5 ? -1 : 1;
}

function applyBackgroundMotionSeed() {
  const rootStyle = document.documentElement.style;
  const setVar = (name, value) => rootStyle.setProperty(name, String(value));

  const durationA = randomInRange(28, 38);
  const durationB = randomInRange(33, 45);
  setVar("--bg-float-a-duration", `${durationA.toFixed(2)}s`);
  setVar("--bg-float-b-duration", `${durationB.toFixed(2)}s`);
  setVar("--bg-float-a-delay", `-${randomInRange(0, durationA).toFixed(2)}s`);
  setVar("--bg-float-b-delay", `-${randomInRange(0, durationB).toFixed(2)}s`);
  setVar("--bg-float-a-direction", Math.random() < 0.5 ? "alternate" : "alternate-reverse");
  setVar("--bg-float-b-direction", Math.random() < 0.5 ? "alternate" : "alternate-reverse");

  setVar("--bg-float-a-x1", (randomSign() * randomInRange(3.5, 6.8)).toFixed(2));
  setVar("--bg-float-a-y1", randomInRange(2.2, 4.8).toFixed(2));
  setVar("--bg-float-a-s1", randomInRange(1.014, 1.024).toFixed(3));
  setVar("--bg-float-a-x2", (randomSign() * randomInRange(3.8, 7.4)).toFixed(2));
  setVar("--bg-float-a-y2", randomInRange(5.8, 9.8).toFixed(2));
  setVar("--bg-float-a-s2", randomInRange(1.022, 1.035).toFixed(3));
  setVar("--bg-float-a-x3", (randomSign() * randomInRange(2.8, 6.2)).toFixed(2));
  setVar("--bg-float-a-y3", randomInRange(9.0, 13.6).toFixed(2));
  setVar("--bg-float-a-s3", randomInRange(1.018, 1.03).toFixed(3));
  setVar("--bg-float-a-x4", (randomSign() * randomInRange(1.8, 4.8)).toFixed(2));
  setVar("--bg-float-a-y4", randomInRange(4.4, 8.2).toFixed(2));
  setVar("--bg-float-a-s4", randomInRange(1.008, 1.02).toFixed(3));

  setVar("--bg-float-b-x1", (randomSign() * randomInRange(3.8, 7.2)).toFixed(2));
  setVar("--bg-float-b-y1", randomInRange(2.8, 5.6).toFixed(2));
  setVar("--bg-float-b-s1", randomInRange(1.012, 1.023).toFixed(3));
  setVar("--bg-float-b-x2", (randomSign() * randomInRange(3.4, 6.8)).toFixed(2));
  setVar("--bg-float-b-y2", randomInRange(7.2, 11.4).toFixed(2));
  setVar("--bg-float-b-s2", randomInRange(1.02, 1.034).toFixed(3));
  setVar("--bg-float-b-x3", (randomSign() * randomInRange(2.6, 5.9)).toFixed(2));
  setVar("--bg-float-b-y3", randomInRange(10.6, 15.2).toFixed(2));
  setVar("--bg-float-b-s3", randomInRange(1.016, 1.028).toFixed(3));
  setVar("--bg-float-b-x4", (randomSign() * randomInRange(1.6, 4.8)).toFixed(2));
  setVar("--bg-float-b-y4", randomInRange(5.0, 8.8).toFixed(2));
  setVar("--bg-float-b-s4", randomInRange(1.006, 1.018).toFixed(3));
}
const systemThemeQuery = window.matchMedia
  ? window.matchMedia("(prefers-color-scheme: dark)")
  : null;

applyBackgroundMotionSeed();
applyTheme(resolveInitialTheme());

document.addEventListener("DOMContentLoaded", () => {
  const themeToggle = document.querySelector("[data-theme-toggle]");
  if (!themeToggle) return;

  themeToggle.addEventListener("click", () => {
    const currentTheme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    persistThemePreference(nextTheme, getSystemTheme());
  });

  const syncToSystemTheme = () => {
    const systemTheme = getSystemTheme();
    applyTheme(systemTheme);
    persistThemePreference(systemTheme, systemTheme);
  };

  if (systemThemeQuery) {
    if (typeof systemThemeQuery.addEventListener === "function") {
      systemThemeQuery.addEventListener("change", syncToSystemTheme);
    } else if (typeof systemThemeQuery.addListener === "function") {
      systemThemeQuery.addListener(syncToSystemTheme);
    }
  }
});
