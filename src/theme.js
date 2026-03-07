function getSystemTheme() {
  if (!window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const THEME_STORAGE_KEY = "creditcombo-theme";
const THEME_SYSTEM_STORAGE_KEY = "creditcombo-theme-system";

function applyBackgroundMotionSeed() {
  const rootStyle = document.documentElement.style;
  const rand = (min, max) => min + Math.random() * (max - min);
  const pick = (items) => items[Math.floor(Math.random() * items.length)];

  rootStyle.setProperty("--bg-float-a-duration", `${rand(30, 42).toFixed(2)}s`);
  rootStyle.setProperty("--bg-float-b-duration", `${rand(34, 48).toFixed(2)}s`);
  rootStyle.setProperty("--bg-float-a-delay", `${(-rand(0, 42)).toFixed(2)}s`);
  rootStyle.setProperty("--bg-float-b-delay", `${(-rand(0, 48)).toFixed(2)}s`);
  rootStyle.setProperty("--bg-float-a-direction", pick(["alternate", "alternate-reverse"]));
  rootStyle.setProperty("--bg-float-b-direction", pick(["alternate", "alternate-reverse"]));
  rootStyle.setProperty("--bg-float-a-rotate", `${rand(-1.4, 1.4).toFixed(2)}deg`);
  rootStyle.setProperty("--bg-float-b-rotate", `${rand(-1.8, 1.8).toFixed(2)}deg`);
}


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
