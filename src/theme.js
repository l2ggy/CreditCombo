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


function applyBackgroundMotionSeed() {
  const root = document.documentElement;
  const randomRange = (min, max) => min + Math.random() * (max - min);
  const randomSign = () => (Math.random() < 0.5 ? -1 : 1);

  root.style.setProperty("--bg-float-a-duration", `${randomRange(28, 38).toFixed(2)}s`);
  root.style.setProperty("--bg-float-b-duration", `${randomRange(34, 46).toFixed(2)}s`);
  root.style.setProperty("--bg-float-a-delay", `${(-1 * randomRange(0, 18)).toFixed(2)}s`);
  root.style.setProperty("--bg-float-b-delay", `${(-1 * randomRange(0, 20)).toFixed(2)}s`);
  root.style.setProperty("--bg-float-a-dir-x", String(randomSign()));
  root.style.setProperty("--bg-float-b-dir-x", String(randomSign()));
  root.style.setProperty("--bg-float-a-start-x", `${randomRange(-3.5, 3.5).toFixed(2)}vw`);
  root.style.setProperty("--bg-float-a-start-y", `${randomRange(-2.2, 2.2).toFixed(2)}vh`);
  root.style.setProperty("--bg-float-b-start-x", `${randomRange(-4.2, 4.2).toFixed(2)}vw`);
  root.style.setProperty("--bg-float-b-start-y", `${randomRange(-2.8, 2.8).toFixed(2)}vh`);
  root.style.setProperty("--bg-float-a-boost", `${randomRange(-1.2, 2.8).toFixed(2)}vh`);
  root.style.setProperty("--bg-float-b-boost", `${randomRange(-1.8, 3.4).toFixed(2)}vh`);
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
