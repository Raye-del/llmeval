(function () {
  const gradeOptions = {
    本科: ["大一", "大二", "大三", "大四", "大五"],
    硕士: ["研一", "研二", "研三"],
    博士: ["博一", "博二", "博三", "博四", "博五"],
    其他: ["其他"],
  };

  const STORAGE_PREFIX = "cross-cultural-quiz";
  const DEFAULT_CONFIG = {
    defaultQuestionCount: 15,
    autosaveIntervalMs: 15000,
  };

  const state = {
    config: { ...DEFAULT_CONFIG },
    student: {
      name: "",
      student_id: "",
      age: "",
      nationality: "",
      major: "",
      education_level: "",
      grade: "",
    },
    assignment: {
      start: 1,
      count: DEFAULT_CONFIG.defaultQuestionCount,
    },
    sessionId: "",
    questionBank: [],
    questions: [],
    answers: {},
    rationales: {},
    currentIndex: 0,
    started: false,
    submittedAt: "",
    lastSavedAt: "",
    autosaveTimer: null,
    submitted: false,
  };

  const elements = {
    sidePanel: document.getElementById("sidePanel"),
    introCard: document.getElementById("introCard"),
    infoCard: document.getElementById("infoCard"),
    statusCard: document.getElementById("statusCard"),
    progressSideCard: document.getElementById("progressSideCard"),
    studentName: document.getElementById("studentName"),
    studentId: document.getElementById("studentId"),
    studentAge: document.getElementById("studentAge"),
    studentNationality: document.getElementById("studentNationality"),
    studentMajor: document.getElementById("studentMajor"),
    studentEducationLevel: document.getElementById("studentEducationLevel"),
    studentGrade: document.getElementById("studentGrade"),
    assignmentStart: document.getElementById("assignmentStart"),
    startBtn: document.getElementById("startBtn"),
    serverStatus: document.getElementById("serverStatus"),
    downloadBtn: document.getElementById("downloadBtn"),
    resetBtn: document.getElementById("resetBtn"),
    progressText: document.getElementById("progressText"),
    progressBar: document.getElementById("progressBar"),
    currentQuestionText: document.getElementById("currentQuestionText"),
    answerStatusText: document.getElementById("answerStatusText"),
    questionCard: document.getElementById("questionCard"),
  };

  function setStatus(message) {
    elements.serverStatus.textContent = message;
  }

  function populateGradeOptions(level) {
    const options = gradeOptions[level] || [];
    const placeholder = level ? "请选择年级" : "请先选择学历层级";
    elements.studentGrade.innerHTML = [`<option value="">${placeholder}</option>`]
      .concat(options.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`))
      .join("");
  }

  function normalizeStudentInput() {
    return {
      name: elements.studentName.value.trim(),
      student_id: elements.studentId.value.trim(),
      age: elements.studentAge.value.trim(),
      nationality: elements.studentNationality.value.trim(),
      major: elements.studentMajor.value.trim(),
      education_level: elements.studentEducationLevel.value.trim(),
      grade: elements.studentGrade.value.trim(),
    };
  }

  function syncInputsFromState() {
    elements.studentName.value = state.student.name || "";
    elements.studentId.value = state.student.student_id || "";
    elements.studentAge.value = state.student.age || "";
    elements.studentNationality.value = state.student.nationality || "";
    elements.studentMajor.value = state.student.major || "";
    elements.studentEducationLevel.value = state.student.education_level || "";
    populateGradeOptions(state.student.education_level || "");
    elements.studentGrade.value = state.student.grade || "";
    elements.assignmentStart.value = String(state.assignment.start || 1);
  }

  function answeredCount() {
    return state.questions.filter((question) => state.answers[question.case_id]).length;
  }

  function buildStorageKey(sessionId) {
    return `${STORAGE_PREFIX}:${sessionId}`;
  }

  function buildSessionPayload() {
    return {
      session_id: state.sessionId,
      student: state.student,
      assignment: state.assignment,
      submitted_at: state.submittedAt,
      last_saved_at: state.lastSavedAt,
      total_questions: state.questions.length,
      answered_questions: answeredCount(),
      responses: state.questions.map((question) => ({
        row_id: question.row_id,
        case_id: question.case_id,
        question_country: question.country,
        category: question.category,
        title: question.title,
        selected_answer: state.answers[question.case_id] || "",
        rationale_choice: state.rationales[question.case_id] || "",
      })),
    };
  }

  function buildLocalSnapshot() {
    return {
      session_id: state.sessionId,
      student: state.student,
      assignment: state.assignment,
      answers: state.answers,
      rationales: state.rationales,
      current_index: state.currentIndex,
      submitted_at: state.submittedAt,
      last_saved_at: state.lastSavedAt,
      started: state.started,
      submitted: state.submitted,
    };
  }

  function persistSession(showSuccessMessage) {
    if (!state.sessionId || !state.started) {
      return;
    }

    state.lastSavedAt = new Date().toISOString();
    window.localStorage.setItem(buildStorageKey(state.sessionId), JSON.stringify(buildLocalSnapshot()));
    setStatus(
      showSuccessMessage
        ? `已保存到当前浏览器：${formatTime(state.lastSavedAt)}`
        : `已自动保存到当前浏览器：${formatTime(state.lastSavedAt)}`
    );
  }

  function stopAutosave() {
    if (state.autosaveTimer) {
      window.clearInterval(state.autosaveTimer);
      state.autosaveTimer = null;
    }
  }

  function startAutosave() {
    stopAutosave();
    state.autosaveTimer = window.setInterval(() => {
      persistSession(false);
    }, state.config.autosaveIntervalMs);
  }

  async function loadQuestionBank() {
    const response = await fetch("./data/questions.json", {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`题库加载失败: ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error("题库格式不正确。");
    }

    state.questionBank = data;
  }

  function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function selectQuestions(start, count, nationality) {
    const selected = [];
    const excludedNationality = normalizeText(nationality);

    for (const question of state.questionBank) {
      if (question.row_id < start) {
        continue;
      }
      if (excludedNationality && normalizeText(question.country) === excludedNationality) {
        continue;
      }
      selected.push(question);
      if (selected.length >= count) {
        break;
      }
    }

    return selected;
  }

  function buildSessionId() {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID().replace(/-/g, "");
    }

    return `${Date.now()}${Math.random().toString(16).slice(2)}`;
  }

  function restoreSessionFromStorage(snapshot) {
    state.sessionId = snapshot.session_id || "";
    state.student = snapshot.student || { ...state.student };
    state.assignment = snapshot.assignment || { ...state.assignment };
    state.questions = selectQuestions(
      Number(state.assignment.start) || 1,
      Number(state.assignment.count) || state.config.defaultQuestionCount,
      state.student.nationality
    );
    state.answers = snapshot.answers || {};
    state.rationales = snapshot.rationales || {};
    state.currentIndex = Math.min(snapshot.current_index || 0, Math.max(state.questions.length - 1, 0));
    state.started = Boolean(snapshot.started && state.questions.length);
    state.submittedAt = snapshot.submitted_at || "";
    state.lastSavedAt = snapshot.last_saved_at || "";
    state.submitted = Boolean(snapshot.submitted);

    syncInputsFromState();
    if (state.started && !state.submitted) {
      startAutosave();
    }
  }

  function tryRestoreLatestSession() {
    const keys = Object.keys(window.localStorage).filter((key) => key.startsWith(`${STORAGE_PREFIX}:`));
    if (!keys.length) {
      return false;
    }

    const snapshots = keys
      .map((key) => {
        try {
          const value = window.localStorage.getItem(key);
          return value ? JSON.parse(value) : null;
        } catch (error) {
          return null;
        }
      })
      .filter(Boolean)
      .sort((left, right) => {
        const leftTime = new Date(left.last_saved_at || 0).getTime();
        const rightTime = new Date(right.last_saved_at || 0).getTime();
        return rightTime - leftTime;
      });

    if (!snapshots.length) {
      return false;
    }

    restoreSessionFromStorage(snapshots[0]);
    return state.started;
  }

  function validateStudent(student) {
    const requiredFields = [
      ["姓名", student.name],
      ["学号", student.student_id],
      ["年龄", student.age],
      ["国籍", student.nationality],
      ["专业", student.major],
      ["学历层级", student.education_level],
      ["年级", student.grade],
    ];

    const missing = requiredFields.find((item) => !item[1]);
    if (missing) {
      window.alert(`请先填写${missing[0]}。`);
      return false;
    }

    const ageNumber = Number(student.age);
    if (!Number.isInteger(ageNumber) || ageNumber <= 0 || ageNumber > 120) {
      window.alert("年龄需要填写 1 到 120 之间的整数。");
      return false;
    }

    return true;
  }

  function startSession() {
    const student = normalizeStudentInput();
    if (!validateStudent(student)) {
      return;
    }

    const start = Math.max(1, Number(elements.assignmentStart.value) || 1);
    const questions = selectQuestions(start, state.config.defaultQuestionCount, student.nationality);

    if (!questions.length) {
      window.alert("没有找到符合条件的题目。请调整起始题号后重试。");
      return;
    }

    state.student = student;
    state.assignment = {
      start,
      count: questions.length,
    };
    state.sessionId = buildSessionId();
    state.questions = questions;
    state.answers = {};
    state.rationales = {};
    state.currentIndex = 0;
    state.started = true;
    state.submittedAt = "";
    state.lastSavedAt = "";
    state.submitted = false;

    persistSession(true);
    startAutosave();
    render();
  }

  function submitSession() {
    if (!state.started || !state.sessionId) {
      return;
    }

    state.submittedAt = new Date().toISOString();
    state.submitted = true;
    persistSession(true);
    stopAutosave();
    setStatus(`作答已完成。请下载 JSON 并提交给老师。提交时间：${formatTime(state.submittedAt)}`);
    render();
  }

  function downloadTextFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function buildExportFilename() {
    const start = state.assignment.start || 1;
    const end = start + Math.max(state.questions.length - 1, 0);
    const safeName = (state.student.name || "未命名").replace(/[\\/:*?"<>|]+/g, "_").trim() || "未命名";
    return `${start}-${end}_${safeName}.json`;
  }

  function downloadJson() {
    const payload = JSON.stringify(buildSessionPayload(), null, 2);
    downloadTextFile(buildExportFilename(), payload, "application/json;charset=utf-8");
    setStatus("答卷 JSON 已下载。");
  }

  function resetSession() {
    if (!state.sessionId) {
      return;
    }

    const confirmed = window.confirm("确认清空当前作答吗？");
    if (!confirmed) {
      return;
    }

    stopAutosave();
    window.localStorage.removeItem(buildStorageKey(state.sessionId));

    state.student = {
      name: "",
      student_id: "",
      age: "",
      nationality: "",
      major: "",
      education_level: "",
      grade: "",
    };
    state.assignment = {
      start: 1,
      count: state.config.defaultQuestionCount,
    };
    state.sessionId = "";
    state.questions = [];
    state.answers = {};
    state.rationales = {};
    state.currentIndex = 0;
    state.started = false;
    state.submittedAt = "";
    state.lastSavedAt = "";
    state.submitted = false;

    syncInputsFromState();
    setStatus("已清空当前浏览器中的作答记录。");
    render();
  }

  function renderQuestion() {
    if (!state.started || !state.questions.length) {
      elements.questionCard.className = "question-card card empty-state";
      elements.questionCard.innerHTML = "<p>尚未载入题目。</p>";
      return;
    }

    if (state.submitted) {
      elements.questionCard.className = "question-card card submitted-state";
      elements.questionCard.innerHTML = `
        <div class="submitted-mark">已完成</div>
        <h3 class="submitted-title">答题已完成</h3>
        <p class="submitted-text">你的答案已保存在当前浏览器。请点击左侧“下载 JSON”，将文件提交给老师。</p>
        <div class="submitted-meta">完成时间：${escapeHtml(formatTime(state.submittedAt))}</div>
      `;
      return;
    }

    const question = state.questions[state.currentIndex];
    const selected = state.answers[question.case_id] || "";
    const rationale = state.rationales[question.case_id] || "";

    const optionHtml = question.options
      .map(
        (option) => `
          <button class="option ${selected === option.key ? "selected" : ""}" data-answer="${option.key}" type="button">
            <span class="option-key">${escapeHtml(option.key)}</span>
            <span class="option-text">${escapeHtml(option.text)}</span>
          </button>
        `
      )
      .join("");

    const rationaleHtml = [
      {
        key: "A",
        text: "我阅读案例并根据其中细节推理出来的",
      },
      {
        key: "B",
        text: "我了解案例涉及的跨文化背景知识",
      },
      {
        key: "C",
        text: "我是凭直觉或普通经验判断的",
      },
    ]
      .map(
        (item) => `
          <button class="rationale-option ${rationale === item.key ? "selected" : ""}" data-rationale="${item.key}" type="button">
            <span class="rationale-key">${escapeHtml(item.key)}</span>
            <span class="rationale-text">${escapeHtml(item.text)}</span>
          </button>
        `
      )
      .join("");

    elements.questionCard.className = "question-card card";
    elements.questionCard.innerHTML = `
      <section class="question-section">
        <div class="section-label">案例名称</div>
        <div class="section-body section-title">${escapeHtml(question.title)}</div>
      </section>
      <section class="question-section">
        <div class="section-label">案例内容</div>
        <div class="section-body section-content">${escapeHtml(question.content)}</div>
      </section>
      <section class="question-section">
        <div class="section-body section-question">${escapeHtml(question.question)}</div>
      </section>
      <div class="options-panel">
        <div class="options">${optionHtml}</div>
      </div>
      <div class="rationale-panel">
        <div class="section-label">你为什么这样选择？</div>
        <div class="rationale-options">${rationaleHtml}</div>
      </div>
      <div class="question-actions">
        <button class="ghost-btn" id="questionPrevBtn" ${state.currentIndex === 0 ? "disabled" : ""}>上一题</button>
        <button class="primary-btn" id="questionNextBtn" ${state.currentIndex >= state.questions.length - 1 ? "disabled" : ""}>下一题</button>
        <button class="secondary-btn" id="questionSubmitBtn" ${!state.questions.length ? "disabled" : ""}>完成并提交</button>
      </div>
    `;

    elements.questionCard.querySelectorAll(".option").forEach((button) => {
      button.addEventListener("click", () => {
        state.answers[question.case_id] = button.dataset.answer;
        persistSession(false);
        render();
      });
    });

    elements.questionCard.querySelectorAll(".rationale-option").forEach((button) => {
      button.addEventListener("click", () => {
        state.rationales[question.case_id] = button.dataset.rationale;
        persistSession(false);
        render();
      });
    });

    document.getElementById("questionPrevBtn")?.addEventListener("click", () => {
      state.currentIndex = Math.max(0, state.currentIndex - 1);
      render();
    });

    document.getElementById("questionNextBtn")?.addEventListener("click", () => {
      state.currentIndex = Math.min(state.questions.length - 1, state.currentIndex + 1);
      render();
    });

    document.getElementById("questionSubmitBtn")?.addEventListener("click", submitSession);
  }

  function render() {
    const total = state.questions.length;
    const answered = answeredCount();
    const percent = total ? Math.round((answered / total) * 100) : 0;

    elements.progressText.textContent = `${answered} / ${total}`;
    elements.progressBar.style.width = `${percent}%`;
    elements.downloadBtn.disabled = !state.started || !total;
    elements.resetBtn.disabled = !state.started;
    elements.sidePanel.classList.toggle("collapsed", state.started);
    elements.introCard.classList.toggle("hidden-panel", state.started);
    elements.infoCard.classList.toggle("hidden-panel", state.started);
    elements.statusCard.classList.toggle("sticky-panel", state.started);
    elements.progressSideCard.classList.toggle("sticky-panel-secondary", state.started);
    elements.progressSideCard.classList.toggle("hidden-panel", !state.started);
    elements.currentQuestionText.textContent = total ? `第 ${state.currentIndex + 1} 题` : "第 0 题";
    elements.answerStatusText.textContent = state.submitted
      ? "已完成"
      : total && state.answers[state.questions[state.currentIndex].case_id]
        ? "已作答"
        : "未作答";
    elements.progressBar.classList.toggle("submitted-progress", state.submitted);
    elements.progressText.classList.toggle("submitted-text", state.submitted);

    renderQuestion();
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatTime(value) {
    if (!value) {
      return "";
    }

    try {
      return new Date(value).toLocaleString("zh-CN");
    } catch (error) {
      return value;
    }
  }

  function bindEvents() {
    elements.studentEducationLevel.addEventListener("change", () => {
      populateGradeOptions(elements.studentEducationLevel.value);
    });

    elements.startBtn.addEventListener("click", startSession);
    elements.downloadBtn.addEventListener("click", downloadJson);
    elements.resetBtn.addEventListener("click", resetSession);
  }

  async function initialize() {
    bindEvents();
    populateGradeOptions("");
    elements.assignmentStart.value = "1";

    try {
      await loadQuestionBank();
      if (tryRestoreLatestSession()) {
        setStatus("已恢复你在当前浏览器中的最近一次作答记录。");
      } else {
        setStatus("题库已加载，可以开始答题。");
      }
    } catch (error) {
      setStatus(`无法加载题库：${error.message}`);
    }

    render();
  }

  window.addEventListener("beforeunload", () => {
    stopAutosave();
    persistSession(false);
  });

  initialize();
})();
