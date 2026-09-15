// ==UserScript==
// @name         KodeKloud Persistent Lesson Fullscreen
// @namespace    https://learn.kodekloud.com/
// @version      1.0.0
// @description  Keeps the video maximized when an autoplaying lesson replaces the Vimeo player.
// @match        https://learn.kodekloud.com/learn/courses/*/module/*/lesson/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const MODE_CLASS = "kk-persistent-player";
  const EXIT_BUTTON_ID = "kk-persistent-player-exit";
  const LESSON_PATH = /\/learn\/courses\/[^/]+\/module\/[^/]+\/lesson\/[^/]+/;
  const TRANSITION_WINDOW_MS = 5000;
  const URL_POLL_INTERVAL_MS = 200;

  let lessonPath = getLessonPath();
  let pendingFullscreenExit = null;
  let transitionDeadline = 0;
  let cssFullscreenActive = false;

  addStyles();
  document.addEventListener("fullscreenchange", handleFullscreenChange, true);
  document.addEventListener("webkitfullscreenchange", handleFullscreenChange, true);
  window.setInterval(checkForLessonChange, URL_POLL_INTERVAL_MS);

  function getLessonPath() {
    return window.location.pathname.match(LESSON_PATH)?.[0] ?? null;
  }

  function getFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function handleFullscreenChange() {
    if (getFullscreenElement()) {
      pendingFullscreenExit = null;
      disableCssFullscreen();
      return;
    }

    if (Date.now() <= transitionDeadline) {
      enableCssFullscreen();
      transitionDeadline = 0;
      return;
    }

    const exit = { lessonPath, time: Date.now() };
    pendingFullscreenExit = exit;

    // An Escape-driven exit remains on the same lesson and should stay exited.
    window.setTimeout(() => {
      if (pendingFullscreenExit === exit) {
        pendingFullscreenExit = null;
      }
    }, TRANSITION_WINDOW_MS);
  }

  function checkForLessonChange() {
    const nextLessonPath = getLessonPath();
    if (!nextLessonPath || nextLessonPath === lessonPath) {
      return;
    }

    lessonPath = nextLessonPath;

    if (cssFullscreenActive) {
      return;
    }

    if (getFullscreenElement()) {
      transitionDeadline = Date.now() + TRANSITION_WINDOW_MS;
      return;
    }

    if (
      pendingFullscreenExit &&
      Date.now() - pendingFullscreenExit.time <= TRANSITION_WINDOW_MS
    ) {
      pendingFullscreenExit = null;
      enableCssFullscreen();
    }
  }

  function enableCssFullscreen() {
    cssFullscreenActive = true;
    document.documentElement.classList.add(MODE_CLASS);
    ensureExitButton();
  }

  function disableCssFullscreen() {
    cssFullscreenActive = false;
    document.documentElement.classList.remove(MODE_CLASS);
    document.getElementById(EXIT_BUTTON_ID)?.remove();
  }

  function ensureExitButton() {
    if (!document.body) {
      document.addEventListener("DOMContentLoaded", ensureExitButton, { once: true });
      return;
    }

    if (document.getElementById(EXIT_BUTTON_ID)) {
      return;
    }

    const button = document.createElement("button");
    button.id = EXIT_BUTTON_ID;
    button.type = "button";
    button.textContent = "Exit fullscreen";
    button.setAttribute("aria-label", "Exit persistent video fullscreen");
    button.addEventListener("click", () => {
      pendingFullscreenExit = null;
      transitionDeadline = 0;
      disableCssFullscreen();
    });
    document.body.appendChild(button);
  }

  function addStyles() {
    const style = document.createElement("style");
    style.textContent = `
      html.${MODE_CLASS},
      html.${MODE_CLASS} body {
        overflow: hidden !important;
      }

      html.${MODE_CLASS} [data-tour="video-player"] {
        position: fixed !important;
        inset: 0 !important;
        z-index: 2147483646 !important;
        width: 100vw !important;
        height: 100vh !important;
        max-width: none !important;
        max-height: none !important;
        margin: 0 !important;
        background: #000 !important;
      }

      html.${MODE_CLASS} [data-tour="video-player"] > div,
      html.${MODE_CLASS} [data-tour="video-player"] .vimeo-video,
      html.${MODE_CLASS} [data-tour="video-player"] iframe {
        width: 100% !important;
        height: 100% !important;
        min-height: 100% !important;
        max-width: none !important;
        max-height: none !important;
      }

      #${EXIT_BUTTON_ID} {
        position: fixed !important;
        top: 12px !important;
        right: 12px !important;
        z-index: 2147483647 !important;
        appearance: none !important;
        border: 1px solid rgba(255, 255, 255, 0.55) !important;
        border-radius: 6px !important;
        padding: 7px 10px !important;
        color: #fff !important;
        background: rgba(0, 0, 0, 0.65) !important;
        font: 13px/1.2 system-ui, sans-serif !important;
        cursor: pointer !important;
        opacity: 0.25 !important;
        transition: opacity 120ms ease !important;
      }

      #${EXIT_BUTTON_ID}:hover,
      #${EXIT_BUTTON_ID}:focus-visible {
        opacity: 1 !important;
      }
    `;

    (document.head || document.documentElement).appendChild(style);
  }
})();
