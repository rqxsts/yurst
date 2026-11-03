import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { i18n } from "@/lib/i18n";
import { uiTranslations } from "fumadocs-ui/i18n";

export const translations = i18n
  .translations()
  .extend(uiTranslations())
  .add({
    en: { displayName: "English" },
    uk: {
      displayName: "Українська",
      "Ask AI(AI chat button)": "Запитати ШІ",
      "Choose a language(language switcher)": "Вибрати мову",
      "Choose a language(language switcher)(aria-label)": "Вибрати мову",
      "Close Banner(banner)(aria-label)": "Закрити банер",
      "Close Search(search dialog)(aria-label)": "Закрити пошук",
      "Close Sidebar(aria-label)": "Закрити бічну панель",
      "Close Sidebar(sidebar)(aria-label)": "Закрити бічну панель",
      "Collapse Sidebar(sidebar)(aria-label)": "Згорнути бічну панель",
      "Copied Anchor Link(heading anchor)(aria-label)":
        "Посилання-якір скопійовано",
      "Copied Link(accordion)(aria-label)": "Посилання скопійовано",
      "Copied Markdown(page actions)": "Markdown скопійовано",
      "Copied Text(code block)(aria-label)": "Текст скопійовано",
      "Copy Anchor Link(heading anchor)(aria-label)":
        "Копіювати посилання-якір",
      "Copy Link(accordion)(aria-label)": "Копіювати посилання",
      "Copy Markdown(page actions)": "Копіювати Markdown",
      "Copy Text(code block)(aria-label)": "Копіювати текст",
      "Dark(theme switcher)(aria-label)": "Темна",
      "Default(type table)": "За замовчуванням",
      "Edit on GitHub(edit page)": "Редагувати на GitHub",
      "Hide Sidebar(sidebar)": "Сховати бічну панель",
      "Last updated on(page footer)": "Востаннє оновлено",
      "Layout Tab(layout tab trigger)": "Вкладка макета",
      "Light(theme switcher)(aria-label)": "Світла",
      "Next Page(pagination)": "Наступна сторінка",
      "No Headings(table of contents)": "Немає заголовків",
      "No results found(search dialog)": "Нічого не знайдено",
      "On this page(table of contents)": "Зміст сторінки",
      "Open Search(search trigger)(aria-label)": "Відкрити пошук",
      "Open Sidebar(sidebar)(aria-label)": "Відкрити бічну панель",
      "Open in GitHub(page actions)": "Відкрити в GitHub",
      "Open(page actions)": "Відкрити",

      "Parameters(type table)": "Параметри",
      "Previous Page(pagination)": "Попередня сторінка",
      "Prop(type table)": "Властивість",
      "Returns(type table)": "Повертає",
      "Search(search dialog)": "Пошук",
      "Search(search trigger)": "Пошук",
      "Show Sidebar(sidebar)": "Показати бічну панель",
      "System(theme switcher)(aria-label)": "Системна",
      "Table of Contents(inline table of contents)": "Зміст",

      "Toggle Theme(theme switcher)(aria-label)": "Змінити тему",
      "Type(type table)": "Тип",
      "View as Markdown(page actions)": "Переглянути як Markdown",
    },
  });

export function baseOptions(locale: string): BaseLayoutProps {
  return {
    i18n: {
      defaultLanguage: i18n.defaultLanguage,
      languages: i18n.languages,
    },
    nav: {
      title: "Yurst",
      url: `/${locale}`,
    },
    githubUrl: "https://github.com/rqxsts/yurst",
  };
}
