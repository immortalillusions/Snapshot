"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Filter,
  GripVertical,
  Link2,
  Pencil,
  Plus,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

type Task = {
  id: string;
  name: string;
  course: string;
  due_at: string;
  completed: boolean;
  color: string;
};
type Course = { id: string; name: string; position: number };
const orderCourses = (courses: Course[], courseOrder: string[]) =>
  [...courses].sort((left, right) => {
    const leftIndex = courseOrder.indexOf(left.name);
    const rightIndex = courseOrder.indexOf(right.name);
    return (
      (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) -
        (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex) ||
      left.name.localeCompare(right.name)
    );
  });
const colors = ["coral", "blue", "green", "yellow"];
const dateLabel = (value: string) =>
  new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(
    new Date(value),
  );
const timeLabel = (value: string) =>
  new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(
    new Date(value),
  );

function LandingPage() {
  return (
    <main className="landing-page">
      <header className="landing-nav">
        <Link className="landing-brand" href="/">
          <span className="brand-mark"><Sparkles size={16} /></span>
          <span>snapshot</span>
        </Link>
        <span className="landing-note">A calmer view of what&apos;s ahead</span>
      </header>
      <section className="landing-hero">
        <div className="landing-kicker"><span className="landing-dot" /> Your calendar, in focus</div>
        <h1>Turn a busy calendar<br /><em>into a clear plan.</em></h1>
        <p>Snapshot reads your Google Calendar and turns deadlines into a simple, focused view of what needs your attention next.</p>
        <a className="google-cta" href="/api/auth/google"><span className="google-g">G</span> Continue with Google <span className="cta-arrow">→</span></a>
        <small className="landing-permission">Requires access to your Google Calendar to create and update task events.</small>
      </section>
      <section className="landing-features" aria-label="Snapshot features">
        <article className="feature-card feature-card-tint"><div className="mini-calendar"><span>SEP</span><strong>02</strong><i /></div><h2>See what matters</h2><p>Your upcoming work, gathered into one quiet place.</p></article>
        <article className="feature-card"><div className="mini-stack"><span>CS 2214</span><span>MATH 2210</span><span>PHYS 1020</span></div><h2>Keep every course close</h2><p>Organize deadlines by course without losing the bigger picture.</p></article>
        <article className="feature-card feature-card-warm"><div className="mini-focus"><Check size={22} /><span>in focus</span></div><h2>Plan less. Finish more.</h2><p>Make space for the next right thing, every day.</p></article>
      </section>
      <footer className="landing-footer"><span>snapshot</span><span>Designed around your real calendar</span></footer>
    </main>
  );
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [activeTab, setActiveTab] = useState("Upcoming");
  const [connected, setConnected] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCourse, setShowCourse] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [form, setForm] = useState({
    name: "",
    course: "CS 2214",
    dueAt: "2026-09-02T23:59",
    completed: false,
  });
  const [settings, setSettings] = useState({
    summaryStartTime: "09:30",
    weeklySummaryStartTime: "09:30",
    summaryDurationMinutes: 30,
    lookaheadDays: 10,
    minimumPerCourse: 2,
    courseOrder: [] as string[],
  });
  const [requestedWeeks, setRequestedWeeks] = useState<string[]>([]);
  const [weeklyWeek, setWeeklyWeek] = useState("");
  const [draggedCourse, setDraggedCourse] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const settingsDirty = useRef(false);
  const load = async () => {
    const statusResponse = await fetch("/api/auth/google/status");
    if (statusResponse.ok) setConnected((await statusResponse.json()).connected === true);
    const response = await fetch("/api/tasks");
    if (!response.ok) return;
    const rows = await response.json();
    setTasks(
      rows.map((row: Task, i: number) => ({
        ...row,
        color: colors[i % colors.length],
      })),
    );
    const cr = await fetch("/api/courses");
    const courseRows = cr.ok ? ((await cr.json()) as Course[]) : [];
    const sr = await fetch("/api/settings");
    const nextSettings = sr.ok ? await sr.json() : { courseOrder: [] };
    setCourses(orderCourses(courseRows, nextSettings.courseOrder ?? []));
    if (sr.ok)
      setSettings((current) => ({
        ...current,
        ...nextSettings,
        weeklySummaryStartTime: nextSettings.weeklySummaryStartTime ?? "09:30",
      }));
    const wr = await fetch("/api/weekly-summaries");
    if (wr.ok) setRequestedWeeks(await wr.json());
  };
  // Initial hydration synchronizes the client with the authenticated API state.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);
  useEffect(() => {
    if (isProcessing) document.body.dataset.processing = "true";
    else delete document.body.dataset.processing;
    return () => {
      delete document.body.dataset.processing;
    };
  }, [isProcessing]);
  const runPending = async <T,>(work: () => Promise<T>) => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      return await work();
    } finally {
      setIsProcessing(false);
    }
  };
  const orderedCourseNames = [
    ...settings.courseOrder,
    ...courses.map((course) => course.name),
    ...tasks.map((task) => task.course),
  ].filter((course, index, all) => course && all.indexOf(course) === index);
  const reorderCourse = (source: string, target: string) => {
    if (source === target) return;
    const order = [...orderedCourseNames];
    const sourceIndex = order.indexOf(source);
    const targetIndex = order.indexOf(target);
    if (sourceIndex < 0 || targetIndex < 0) return;
    order.splice(sourceIndex, 1);
    order.splice(targetIndex, 0, source);
    settingsDirty.current = true;
    setSettings((current) => ({ ...current, courseOrder: order }));
  };
  useEffect(() => {
    if (!settingsDirty.current) return;
    const timer = window.setTimeout(() => {
      settingsDirty.current = false;
      void fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      }).then(async (response) => {
        if (!response.ok) {
          settingsDirty.current = true;
          return;
        }
        const nextSettings = await response.json();
        setSettings((current) => ({ ...current, ...nextSettings }));
        setCourses((current) =>
          orderCourses(current, nextSettings.courseOrder ?? []),
        );
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [settings]);
  const visible = tasks.filter((task) =>
    activeTab === "Completed" ? task.completed : !task.completed,
  );
  const groupedByCourse = visible.reduce<Record<string, Task[]>>(
    (all, task) => {
      (all[task.course] ||= []).push(task);
      return all;
    },
    {},
  );
  const orderedGroups = [
    ...orderedCourseNames,
    ...Object.keys(groupedByCourse).filter(
      (course) => !orderedCourseNames.includes(course),
    ),
  ].flatMap((course) =>
    groupedByCourse[course] ? [[course, groupedByCourse[course]] as const] : [],
  );
  const grouped = Object.fromEntries(orderedGroups);
  const update = async (task: Task) => {
    if (task.id.startsWith("demo-")) {
      setTasks((current) =>
        current.map((item) => (item.id === task.id ? task : item)),
      );
      return;
    }
    await runPending(async () => {
      await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: task.name,
          course: task.course,
          dueAt: task.due_at,
          completed: task.completed,
        }),
      });
      await load();
    });
  };
  const openEditor = (task?: Task) => {
    setEditing(task ?? null);
    setForm(
      task
        ? {
            name: task.name,
            course: task.course,
            dueAt: task.due_at.slice(0, 16),
            completed: task.completed,
          }
        : {
            name: "",
            course: orderedCourseNames[0] ?? "CS 2214",
            dueAt: "2026-09-02T23:59",
            completed: false,
          },
    );
    setShowAdd(true);
  };
  const saveTask = async () => {
    if (!form.name.trim()) return;
    if (editing)
      await update({
        ...editing,
        name: form.name.trim(),
        course: form.course,
        due_at: form.dueAt,
        completed: form.completed,
      });
    else
      await runPending(async () => {
        const response = await fetch("/api/tasks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: form.name,
            course: form.course,
            dueAt: new Date(form.dueAt).toISOString(),
            completed: form.completed,
          }),
        });
        if (response.ok) await load();
      });
    setShowAdd(false);
    setEditing(null);
  };
  const remove = async (task: Task) => {
    await runPending(async () => {
      await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      await load();
    });
  };
  const addCourse = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = String(
      new FormData(event.currentTarget).get("name") || "",
    ).trim();
    if (!name) return;
    await runPending(async () => {
      const response = await fetch("/api/courses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (response.ok) await load();
      setShowCourse(false);
    });
  };
  const updateSettings = <K extends keyof typeof settings>(
    key: K,
    value: (typeof settings)[K],
  ) => {
    settingsDirty.current = true;
    setSettings((current) => ({ ...current, [key]: value }));
  };
  const disconnect = async () => {
    if (
      !window.confirm(
        "Disconnect Google Calendar? Snapshot will remove its local calendar data, but Google events will stay unchanged.",
      )
    )
      return;
    await runPending(async () => {
      const response = await fetch("/api/auth/google/disconnect", {
        method: "DELETE",
      });
      if (response.ok) {
        setConnected(false);
        setShowSettings(false);
      }
    });
  };
  const requestWeeklyWeek = async () => {
    if (!weeklyWeek) return;
    await runPending(async () => {
      const response = await fetch("/api/weekly-summaries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ weekStart: weeklyWeek }),
      });
      if (response.ok) {
        const result = await response.json();
        setRequestedWeeks((current) =>
          [...new Set([...current, result.weekStart])].sort(),
        );
        setWeeklyWeek("");
      }
    });
  };
  const removeWeeklyWeek = async (weekStart: string) => {
    await runPending(async () => {
      const response = await fetch(`/api/weekly-summaries/${weekStart}`, {
        method: "DELETE",
      });
      if (response.ok)
        setRequestedWeeks((current) =>
          current.filter((week) => week !== weekStart),
        );
    });
  };

  if (!connected) return <LandingPage />;

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Sparkles size={17} />
          </span>
          <span>snapshot</span>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="nav">
          <button className="nav-item active">
            <CalendarDays size={18} /> Overview
          </button>
          <button className="nav-item">
            <Check size={18} /> All tasks{" "}
            <span className="nav-count">{tasks.length}</span>
          </button>
        </nav>
        <div className="workspace-label courses-label">
          COURSES{" "}
          <button aria-label="Add course" onClick={() => setShowCourse(true)}>
            <Plus size={15} />
          </button>
        </div>
        <div className="course-list">
          {(courses.length
            ? courses
            : [...new Set(tasks.map((task) => task.course))].map((name, i) => ({
                id: name,
                name,
                position: i,
              }))
          ).map((course) => (
            <span key={course.id}>
              <i className={`dot ${colors[course.position % colors.length]}`} />{" "}
              {course.name}
            </span>
          ))}
        </div>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setShowSettings(true)}>
            <Settings2 size={18} /> Settings
          </button>
          <button className="nav-item">
            <CircleHelp size={18} /> Help center
          </button>
          <div className="profile">
            <div className="avatar">JL</div>
            <div>
              <strong>Jordan Lee</strong>
              <small>
                {connected ? "Calendar connected" : "Demo workspace"}
              </small>
            </div>
          </div>
        </div>
      </aside>
      <section className="content">
        <header className="topbar">
          <div className="mobile-brand">snapshot</div>
          <div className="sync-status">
            <span className="pulse" />{" "}
            {connected ? "Synced with Google Calendar" : "Preview mode"}{" "}
            <span className="sync-time">
              {connected ? "just now" : "connect to sync"}
            </span>
          </div>
          <div className="top-actions">
            <button className="icon-button" aria-label="Notifications">
              <Bell size={18} />
            </button>
            {connected ? (
              <button
                className="settings-link"
                onClick={() => setShowSettings(true)}
              >
                <Settings2 size={17} /> Settings
              </button>
            ) : (
              <a className="settings-link" href="/api/auth/google">
                <Link2 size={17} /> Connect Google
              </a>
            )}
          </div>
        </header>
        <div className="page-heading">
          <div>
            <p className="eyebrow">WEDNESDAY, SEPTEMBER 2, 2026</p>
            <h1>Your day, in focus.</h1>
            <p className="lede">Here&apos;s what needs your attention next.</p>
          </div>
          <button className="add-button" onClick={() => openEditor()}>
            <Plus size={18} /> Add task
          </button>
        </div>
        <div className="summary-strip">
          <div>
            <span className="summary-label">UP NEXT</span>
            <strong>
              {
                tasks.filter(
                  (task) =>
                    !task.completed &&
                    task.due_at.slice(0, 10) === "2026-09-02",
                ).length
              }{" "}
              <small>tasks today</small>
            </strong>
          </div>
          <div className="strip-divider" />
          <div>
            <span className="summary-label">THIS WEEK</span>
            <strong>
              {tasks.filter((task) => !task.completed).length}{" "}
              <small>tasks remaining</small>
            </strong>
          </div>
          <div className="strip-spacer" />
          <div className="calendar-chip">
            <Link2 size={16} />
            <span>{connected ? "Calendar connected" : "Demo data"}</span>
          </div>
        </div>
        <div className="task-toolbar">
          <div className="tabs">
            {["Upcoming", "Completed"].map((tab) => (
              <button
                key={tab}
                className={activeTab === tab ? "tab active-tab" : "tab"}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
                <span>
                  {tab === "Upcoming"
                    ? tasks.filter((t) => !t.completed).length
                    : tasks.filter((t) => t.completed).length}
                </span>
              </button>
            ))}
          </div>
          <button className="filter-button">
            <Filter size={15} /> All courses <ChevronDown size={14} />
          </button>
        </div>
        <div className="task-area">
          {Object.entries(grouped).map(([course, courseTasks]) => (
            <section className="course-section" key={course}>
              <div className="course-heading">
                <div className={`course-line ${courseTasks[0].color}`} />
                <h2>{course}</h2>
                <span>
                  {courseTasks.length}{" "}
                  {courseTasks.length === 1 ? "task" : "tasks"}
                </span>
              </div>
              <div className="task-list">
                {courseTasks.map((task) => (
                  <article
                    className={task.completed ? "task completed" : "task"}
                    key={task.id}
                  >
                    <button
                      className="task-check"
                      onClick={() =>
                        void update({ ...task, completed: !task.completed })
                      }
                      aria-label={
                        task.completed ? "Mark incomplete" : "Mark complete"
                      }
                    >
                      {task.completed && <Check size={14} />}
                    </button>
                    <div className="task-info">
                      <strong>{task.name}</strong>
                      <span>
                        <Clock3 size={13} /> {dateLabel(task.due_at)} <b>·</b>{" "}
                        {timeLabel(task.due_at)}
                      </span>
                    </div>
                    <button
                      className="task-more"
                      onClick={() => openEditor(task)}
                      aria-label={`Edit ${task.name}`}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="task-more"
                      onClick={() => void remove(task)}
                      aria-label={`Delete ${task.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </article>
                ))}
              </div>
            </section>
          ))}
          {!visible.length && (
            <div className="empty-state">
              <Check size={25} />
              <h2>All caught up</h2>
              <p>Nothing else is waiting for you here.</p>
            </div>
          )}
        </div>
        <footer className="content-footer">
          <span>
            <span className="footer-dot" />{" "}
            {connected
              ? "Summary events update automatically"
              : "Preview data only"}
          </span>
          <button>
            <CalendarDays size={14} /> View calendar
          </button>
        </footer>
      </section>
      {showAdd && (
        <div className="modal-backdrop" onClick={() => setShowAdd(false)}>
          <form
            className="modal"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void saveTask();
            }}
          >
            <div className="modal-head">
              <div>
                <span className="eyebrow">
                  {editing ? "EDIT TASK" : "NEW TASK"}
                </span>
                <h2>{editing ? "Edit task" : "Add a task"}</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                aria-label="Close"
              >
                <X size={19} />
              </button>
            </div>
            <label>
              Task name
              <input
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                placeholder="e.g. Finish reading"
                autoFocus
              />
            </label>
            <label>
              Course
              <select
                value={form.course}
                onChange={(event) =>
                  setForm({ ...form, course: event.target.value })
                }
              >
                {[
                  ...new Set([
                    ...courses.map((course) => course.name),
                    ...tasks.map((task) => task.course),
                  ]),
                ].map((course) => (
                  <option key={course}>{course}</option>
                ))}
              </select>
            </label>
            <label>
              Due date and time
              <input
                type="datetime-local"
                value={form.dueAt}
                onChange={(event) =>
                  setForm({ ...form, dueAt: event.target.value })
                }
              />
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={form.completed}
                onChange={(event) =>
                  setForm({ ...form, completed: event.target.checked })
                }
              />{" "}
              Completed
            </label>
            <button className="add-button full" type="submit">
              {editing ? "Save changes" : "Create task"} <Check size={17} />
            </button>
          </form>
        </div>
      )}
      {showCourse && (
        <div className="modal-backdrop" onClick={() => setShowCourse(false)}>
          <form
            className="modal"
            onClick={(event) => event.stopPropagation()}
            onSubmit={addCourse}
          >
            <div className="modal-head">
              <div>
                <span className="eyebrow">COURSES</span>
                <h2>New course</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowCourse(false)}
                aria-label="Close"
              >
                <X size={19} />
              </button>
            </div>
            <label>
              Course name
              <input name="name" placeholder="e.g. HIST 1100" autoFocus />
            </label>
            <button className="add-button full" type="submit">
              Add course <Plus size={17} />
            </button>
          </form>
        </div>
      )}
      {showSettings && (
        <div className="modal-backdrop" onClick={() => setShowSettings(false)}>
          <div
            className="modal settings-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <span className="eyebrow">PREFERENCES</span>
                <h2>Snapshot settings</h2>
              </div>
              <button onClick={() => setShowSettings(false)} aria-label="Close">
                <X size={19} />
              </button>
            </div>
            <div className="setting-row">
              <div>
                <strong>Summary event</strong>
                <span>Start time</span>
              </div>
              <input
                type="time"
                value={settings.summaryStartTime}
                onChange={(event) =>
                  updateSettings("summaryStartTime", event.target.value)
                }
              />
            </div>
            <div className="setting-row">
              <div>
                <strong>Weekly summary</strong>
                <span>Saturday start time</span>
              </div>
              <input
                type="time"
                value={settings.weeklySummaryStartTime}
                onChange={(event) =>
                  updateSettings("weeklySummaryStartTime", event.target.value)
                }
              />
            </div>
            <div className="setting-row">
              <div>
                <strong>Event duration</strong>
                <span>Minutes</span>
              </div>
              <input
                type="number"
                min="5"
                step="5"
                value={settings.summaryDurationMinutes}
                onChange={(event) =>
                  updateSettings(
                    "summaryDurationMinutes",
                    Number(event.target.value),
                  )
                }
              />
            </div>
            <div className="setting-row">
              <div>
                <strong>Lookahead window</strong>
                <span>Calendar days included</span>
              </div>
              <select
                value={settings.lookaheadDays}
                onChange={(event) =>
                  updateSettings("lookaheadDays", Number(event.target.value))
                }
              >
                <option value={7}>7 days</option>
                <option value={10}>10 days</option>
                <option value={14}>14 days</option>
              </select>
            </div>
            <div className="setting-row">
              <div>
                <strong>Minimum per course</strong>
                <span>Keep each course visible</span>
              </div>
              <select
                value={settings.minimumPerCourse}
                onChange={(event) =>
                  updateSettings(
                    "minimumPerCourse",
                    Number(event.target.value),
                  )
                }
              >
                <option value={1}>1 task</option>
                <option value={2}>2 tasks</option>
                <option value={3}>3 tasks</option>
              </select>
            </div>
            <div className="setting-row">
              <div>
                <strong>Specific week</strong>
                <span>Generate and keep updating a week</span>
              </div>
              <div className="week-request">
                <input
                  type="date"
                  value={weeklyWeek}
                  onChange={(event) => setWeeklyWeek(event.target.value)}
                />
                <button
                  type="button"
                  className="add-button"
                  onClick={() => void requestWeeklyWeek()}
                >
                  Add week <Plus size={16} />
                </button>
                {requestedWeeks.map((week) => (
                  <div className="requested-week" key={week}>
                    <span>{week}</span>
                    <button
                      type="button"
                      aria-label={`Remove week ${week}`}
                      onClick={() => void removeWeeklyWeek(week)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="setting-row course-order-row">
              <div>
                <strong>Course order</strong>
                <span>Drag courses to reorder summary sections</span>
              </div>
              <div className="course-order" aria-label="Course order">
                {orderedCourseNames.map((course) => (
                  <div
                    key={course}
                    className={
                      draggedCourse === course
                        ? "course-tile dragging"
                        : "course-tile"
                    }
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", course);
                      setDraggedCourse(course);
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      reorderCourse(
                        event.dataTransfer.getData("text/plain") ||
                          draggedCourse ||
                          "",
                        course,
                      );
                      setDraggedCourse(null);
                    }}
                    onDragEnd={() => setDraggedCourse(null)}
                  >
                    <GripVertical size={15} aria-hidden="true" />
                    <span>{course}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="disconnect-row">
              <div>
                <strong>Google Calendar</strong>
                <span>Disconnect and remove Snapshot&apos;s local calendar data. Google events stay unchanged.</span>
              </div>
              <button type="button" className="danger-button" onClick={() => void disconnect()}>Disconnect</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
