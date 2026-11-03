// app/[lang]/(home)/page.tsx
import { DynamicLink } from 'fumadocs-core/dynamic-link';
import '../../style/main.css';

type Lang = 'en' | 'uk';

const GITHUB_URL = 'https://github.com/rqxsts/yurst';

const t = {
  en: {
    badge: 'Library for Yurba.one bots',
    title: 'Build Yurba bots without the boilerplate',
    subtitle:
      'Yurst is a small Node.js library with a simple API for commands, buttons, callbacks and inline queries. It handles transport, reconnects and command registration, so your bot stays a few lines long.',
    start: 'Get started',
    github: 'GitHub',
    install: 'Install',
    featuresTitle: 'Why Yurst',
    features: [
      {
        title: 'Simple by default',
        text: 'Register a command with a name, a description and a handler. The command list is synced to Yurba automatically.',
      },
      {
        title: 'Callback routing',
        text: 'Match button data by exact value or a colon-separated prefix. The matched handler receives a ready CallbackContext.',
      },
      {
        title: 'Plain-array buttons',
        text: 'Describe keyboards as simple arrays, or use ButtonsBuilder for dynamic layouts and styled buttons.',
      },
      {
        title: "Edit, don't resend",
        text: 'ctx.replace() updates the message in place, so counters and menus keep a stable message id.',
      },
      {
        title: 'Resilient transport',
        text: 'WebSocket updates with automatic reconnect, fall back to long polling, and duplicate update protection.',
      },
      {
        title: 'Inline & keyboards',
        text: 'Handle inline queries, inline buttons and reply keyboards, including placeholder hints.',
      },
    ],
    footer: 'Documentation, guides and API reference are one click away.',
    docs: 'Open documentation',
  },
  uk: {
    badge: 'Бібліотека для ботів Yurba.one',
    title: 'Створюй боти для Yurba без зайвого коду',
    subtitle:
      'Yurst — невелика бібліотека для Node.js з простим API для команд, кнопок, callback-ів та inline-запитів. Транспорт, перепідключення та реєстрацію команд вона бере на себе, тож ваш бот залишається коротким.',
    start: 'Почати',
    github: 'GitHub',
    install: 'Встановлення',
    featuresTitle: 'Чому Yurst',
    features: [
      {
        title: 'Просто за замовчуванням',
        text: 'Команда реєструється з назвою, описом і обробником. Список команд автоматично синхронізується з Yurba.',
      },
      {
        title: 'Роутинг callback-ів',
        text: 'Дані кнопок зіставляються за точним значенням або префіксом до двокрапки. Обробник одразу отримує CallbackContext.',
      },
      {
        title: 'Кнопки як масиви',
        text: 'Клавіатури описуються звичайними масивами, а для динамічних розкладок і стилів є ButtonsBuilder.',
      },
      {
        title: 'Редагуй, а не надсилай заново',
        text: 'ctx.replace() оновлює повідомлення на місці, тож лічильники й меню зберігають стабільний id.',
      },
      {
        title: 'Стійкий транспорт',
        text: 'Оновлення через WebSocket з автоперепідключенням, перехід на long polling і захист від дублікатів.',
      },
      {
        title: 'Inline та клавіатури',
        text: 'Inline-запити, inline-кнопки та reply-клавіатури з підказкою в полі введення.',
      },
    ],
    footer: 'Документація, гайди та довідник API доступні в один клік.',
    docs: 'Відкрити документацію',
  },
} satisfies Record<Lang, unknown>;

export default async function HomePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const l = t[(lang as Lang) in t ? (lang as Lang) : 'en'];

  return (
    <main className="jh">
      {/* Hero */}
      <section className="jh-hero">
        <span className="jh-badge">{l.badge}</span>
        <h1 className="jh-title">{l.title}</h1>
        <p className="jh-subtitle">{l.subtitle}</p>

        <div className="jh-actions">
          <DynamicLink href="/[lang]/docs" className="jh-btn jh-btn--primary">
            {l.start}
          </DynamicLink>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="jh-btn jh-btn--ghost"
          >
            {l.github}
          </a>
        </div>

        <div className="jh-install">
          <span>{l.install}</span>
          <code>npm i yurst</code>
        </div>
      </section>


      {/* Features */}
      <section className="jh-features">
        <h2 className="jh-h2">{l.featuresTitle}</h2>
        <div className="jh-grid">
          {l.features.map((f) => (
            <div key={f.title} className="jh-card">
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer CTA */}
      <section className="jh-cta">
        <p>{l.footer}</p>
        <DynamicLink href="/[lang]/docs" className="jh-link">
          {l.docs}
        </DynamicLink>
      </section>
    </main>
  );
}
