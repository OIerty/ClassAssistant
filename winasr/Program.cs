using System;
using System.Collections.Generic;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Threading.Tasks;
using Windows.Globalization;
using Windows.Media.SpeechRecognition;

static class Program
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private static TimeSpan GetTimeSpanSeconds(string name, TimeSpan fallback)
    {
        var rawValue = Environment.GetEnvironmentVariable(name);
        if (double.TryParse(rawValue, out var seconds) && seconds > 0)
        {
            return TimeSpan.FromSeconds(seconds);
        }

        return fallback;
    }

    private static float GetConfidenceThreshold()
    {
        var rawValue = Environment.GetEnvironmentVariable("WINASR_CONFIDENCE_THRESHOLD");
        if (float.TryParse(rawValue, out var threshold) && threshold >= 0f && threshold <= 1f)
        {
            return threshold;
        }

        return -1f;
    }

    private static void WriteJson(object payload)
    {
        Console.Out.WriteLine(JsonSerializer.Serialize(payload, JsonOptions));
        Console.Out.Flush();
    }

    private static void WriteStatus(string state, string? message = null)
    {
        var payload = new Dictionary<string, object?>
        {
            ["type"] = "status",
            ["state"] = state,
        };

        if (!string.IsNullOrWhiteSpace(message))
        {
            payload["message"] = message;
        }

        WriteJson(payload);
    }

    private static void WriteError(string message)
    {
        WriteJson(new Dictionary<string, object?>
        {
            ["type"] = "error",
            ["message"] = message,
        });
    }

    private static string? GetArg(string[] args, string name)
    {
        for (var index = 0; index < args.Length - 1; index++)
        {
            if (string.Equals(args[index], name, StringComparison.OrdinalIgnoreCase))
            {
                return args[index + 1];
            }
        }

        return null;
    }

    private static TimeSpan GetAutoStopSilenceTimeout()
    {
        return GetTimeSpanSeconds("WINASR_AUTO_STOP_SECONDS", TimeSpan.FromHours(1));
    }

    private static void ConfigureRecognizerTimeouts(SpeechRecognizer recognizer)
    {
        var timeouts = recognizer.Timeouts;
        var initialSilenceTimeout = GetTimeSpanSeconds("WINASR_INITIAL_SILENCE_SECONDS", TimeSpan.FromSeconds(8));
        var endSilenceTimeout = GetTimeSpanSeconds("WINASR_END_SILENCE_SECONDS", TimeSpan.FromSeconds(2.5));
        var babbleTimeout = GetTimeSpanSeconds("WINASR_BABBLE_SECONDS", TimeSpan.FromSeconds(8));

        timeouts.InitialSilenceTimeout = initialSilenceTimeout;
        timeouts.EndSilenceTimeout = endSilenceTimeout;
        timeouts.BabbleTimeout = babbleTimeout;
    }

    public static async Task<int> Main(string[] args)
    {
        Console.InputEncoding = Encoding.UTF8;
        Console.OutputEncoding = Encoding.UTF8;

        var languageTag = GetArg(args, "--language");
        var confidenceThreshold = GetConfidenceThreshold();
        var stopRequested = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);

        try
        {
            WriteStatus("starting");

            _ = Task.Run(() =>
            {
                while (true)
                {
                    var command = Console.ReadLine();
                    if (command is null)
                    {
                        stopRequested.TrySetResult(true);
                        return;
                    }

                    if (string.Equals(command.Trim(), "stop", StringComparison.OrdinalIgnoreCase))
                    {
                        stopRequested.TrySetResult(true);
                        return;
                    }
                }
            });

            Console.CancelKeyPress += (_, eventArgs) =>
            {
                eventArgs.Cancel = true;
                stopRequested.TrySetResult(true);
            };

            while (true)
            {
                using var recognizer = string.IsNullOrWhiteSpace(languageTag)
                    ? new SpeechRecognizer()
                    : new SpeechRecognizer(new Language(languageTag));

                ConfigureRecognizerTimeouts(recognizer);

                recognizer.Constraints.Clear();
                recognizer.Constraints.Add(
                    new SpeechRecognitionTopicConstraint(
                        SpeechRecognitionScenario.Dictation,
                        "dictation"
                    )
                );

                recognizer.HypothesisGenerated += (_, eventArgs) =>
                {
                    var text = eventArgs.Hypothesis?.Text?.Trim();
                    if (!string.IsNullOrWhiteSpace(text))
                    {
                        WriteJson(new Dictionary<string, object?>
                        {
                            ["type"] = "partial",
                            ["text"] = text,
                        });
                    }
                };

                var compileResult = await recognizer.CompileConstraintsAsync();
                if (compileResult.Status != SpeechRecognitionResultStatus.Success)
                {
                    var message = $"CompileConstraintsAsync failed: {compileResult.Status}";
                    WriteError(message);
                    return 1;
                }

                var session = recognizer.ContinuousRecognitionSession;
                session.AutoStopSilenceTimeout = GetAutoStopSilenceTimeout();

                var sessionEnded = new TaskCompletionSource<SpeechRecognitionResultStatus>(TaskCreationOptions.RunContinuationsAsynchronously);

                session.ResultGenerated += (_, eventArgs) =>
                {
                    var text = eventArgs.Result?.Text?.Trim();
                    var confidence = eventArgs.Result?.Confidence;

                    if (!string.IsNullOrWhiteSpace(text) && (confidenceThreshold < 0f || confidence is null || (float)confidence >= confidenceThreshold))
                    {
                        WriteJson(new Dictionary<string, object?>
                        {
                            ["type"] = "final",
                            ["text"] = text,
                            ["confidence"] = confidence,
                        });
                    }
                };

                session.Completed += (_, eventArgs) =>
                {
                    sessionEnded.TrySetResult(eventArgs.Status);
                };

                await session.StartAsync();
                WriteStatus("ready", languageTag);

                var finishedTask = await Task.WhenAny(stopRequested.Task, sessionEnded.Task);
                if (finishedTask == stopRequested.Task)
                {
                    WriteStatus("stopping");
                    try
                    {
                        await session.StopAsync();
                    }
                    catch (Exception exception)
                    {
                        WriteError($"StopAsync failed: {exception.Message}");
                    }

                    WriteStatus("stopped");
                    break;
                }

                var status = await sessionEnded.Task;
                WriteStatus("session_ended", status.ToString());

                if (stopRequested.Task.IsCompleted)
                {
                    break;
                }

                await Task.Delay(500);
            }

            return 0;
        }
        catch (Exception exception)
        {
            WriteError(exception.Message);
            return 1;
        }
    }
}