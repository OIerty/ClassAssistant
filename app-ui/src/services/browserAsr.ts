import { ingestAsrText } from "./api";

type SpeechRecognitionResultLike = {
    isFinal: boolean;
    [index: number]: { transcript?: string };
};

type SpeechRecognitionEventLike = {
    resultIndex: number;
    results: Array<SpeechRecognitionResultLike>;
};

type RecognitionConstructor = new () => {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    maxAlternatives: number;
    start: () => void;
    stop: () => void;
    abort: () => void;
    onresult: ((event: SpeechRecognitionEventLike) => void) | null;
    onerror: ((event: { error?: string; message?: string }) => void) | null;
    onend: (() => void) | null;
};

export interface BrowserAsrSession {
    start: () => Promise<void>;
    stop: () => Promise<void>;
}

export interface BrowserAsrOptions {
    lang?: string;
}

const AUTO_RESTART_DELAY_MS = 400;

function getRecognitionConstructor(): RecognitionConstructor | null {
    const globalWindow = window as Window & {
        SpeechRecognition?: RecognitionConstructor;
        webkitSpeechRecognition?: RecognitionConstructor;
    };

    return globalWindow.SpeechRecognition || globalWindow.webkitSpeechRecognition || null;
}

export function createBrowserAsrSession(
    onStatus?: (message: string) => void,
    options: BrowserAsrOptions = {}
): BrowserAsrSession {
    const Recognition = getRecognitionConstructor();
    if (!Recognition) {
        throw new Error("当前浏览器/内核不支持 SpeechRecognition / webkitSpeechRecognition");
    }

    const recognition = new Recognition();
    recognition.lang = options.lang?.trim() || "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let isRunning = false;
    let isManuallyStopped = false;
    let restartTimer: number | null = null;
    let pendingInterimTimer: number | null = null;
    let pendingInterimTranscript = "";
    let lastSentFinalTranscript = "";
    let lastSentInterimTranscript = "";
    let sendQueue: Promise<void> = Promise.resolve();

    const clearRestartTimer = () => {
        if (restartTimer !== null) {
            window.clearTimeout(restartTimer);
            restartTimer = null;
        }
    };

    const clearPendingInterimTimer = () => {
        if (pendingInterimTimer !== null) {
            window.clearTimeout(pendingInterimTimer);
            pendingInterimTimer = null;
        }
    };

    const sendTranscript = (transcript: string, isFinal: boolean) => {
        if (isFinal) {
            if (transcript === lastSentFinalTranscript) {
                return;
            }

            lastSentFinalTranscript = transcript;
            lastSentInterimTranscript = "";
        } else {
            if (transcript === lastSentInterimTranscript || transcript === lastSentFinalTranscript) {
                return;
            }

            lastSentInterimTranscript = transcript;
        }

        sendQueue = sendQueue
            .then(() =>
                ingestAsrText({
                    text: transcript,
                    is_final: isFinal,
                })
            )
            .then(() => undefined)
            .catch((error) => {
                onStatus?.(error instanceof Error ? error.message : "浏览器语音文本注入失败");
            });
    };

    const scheduleInterimFlush = () => {
        clearPendingInterimTimer();
        pendingInterimTimer = window.setTimeout(() => {
            pendingInterimTimer = null;
            if (!isRunning || isManuallyStopped || !pendingInterimTranscript) {
                return;
            }

            const transcript = pendingInterimTranscript;
            pendingInterimTranscript = "";
            sendTranscript(transcript, false);
        }, 500);
    };

    const scheduleRestart = () => {
        clearRestartTimer();
        restartTimer = window.setTimeout(() => {
            restartTimer = null;
            if (!isRunning || isManuallyStopped) {
                return;
            }

            try {
                recognition.start();
            } catch {
                scheduleRestart();
            }
        }, AUTO_RESTART_DELAY_MS);
    };

    recognition.onresult = (event) => {
        if (!isRunning || isManuallyStopped) {
            return;
        }

        for (let index = event.resultIndex; index < event.results.length; index += 1) {
            const result = event.results[index];
            const transcript = result?.[0]?.transcript?.trim();
            if (!transcript) {
                continue;
            }

            if (result.isFinal) {
                clearPendingInterimTimer();
                pendingInterimTranscript = "";
                sendTranscript(transcript, true);
                continue;
            }

            pendingInterimTranscript = transcript;
            scheduleInterimFlush();
        }
    };

    recognition.onerror = (event) => {
        const message = event.error || event.message || "浏览器语音识别发生错误";
        onStatus?.(message);

        const fatalErrors = new Set(["not-allowed", "service-not-allowed", "audio-capture"]);
        if (event.error && fatalErrors.has(event.error)) {
            isRunning = false;
            clearRestartTimer();
        }
    };

    recognition.onend = () => {
        if (!isRunning || isManuallyStopped) {
            return;
        }

        scheduleRestart();
    };

    return {
        start: async () => {
            isRunning = true;
            isManuallyStopped = false;
            clearRestartTimer();
            onStatus?.("正在启动浏览器语音识别...");
            try {
                recognition.start();
            } catch {
                scheduleRestart();
            }
        },
        stop: async () => {
            isManuallyStopped = true;
            isRunning = false;
            clearRestartTimer();
            clearPendingInterimTimer();
            try {
                recognition.stop();
            } catch {
                try {
                    recognition.abort();
                } catch {
                    /* ignore abort errors */
                }
            }
        },
    };
}
