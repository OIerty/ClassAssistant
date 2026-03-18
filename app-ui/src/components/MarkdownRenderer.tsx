import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import "katex/dist/katex.min.css";

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames || []),
    "span",
    "div",
    "sub",
    "sup",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
  ],
  attributes: {
    ...(defaultSchema.attributes || {}),
    "*": [
      ...(((defaultSchema.attributes || {})["*"] as string[]) || []),
      "className",
      "class",
    ],
    a: [
      ...((((defaultSchema.attributes || {})["a"] as string[]) || [])),
      "href",
      "title",
      "target",
      "rel",
    ],
    code: [
      ...((((defaultSchema.attributes || {})["code"] as string[]) || [])),
      "className",
      "class",
    ],
    span: [
      ...((((defaultSchema.attributes || {})["span"] as string[]) || [])),
      "className",
      "class",
      "style",
    ],
    div: [
      ...((((defaultSchema.attributes || {})["div"] as string[]) || [])),
      "className",
      "class",
      "style",
    ],
  },
};

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export default function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  return (
    <div className={`markdown-renderer text-xs leading-relaxed text-white/88 ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, rehypeKatex, [rehypeSanitize, sanitizeSchema]]}
        components={{
          p: (props) => <p className="mb-2 last:mb-0" {...props} />,
          ul: (props) => <ul className="mb-2 list-disc pl-5" {...props} />,
          ol: (props) => <ol className="mb-2 list-decimal pl-5" {...props} />,
          code: (props) => {
            const classNameValue = props.className || "";
            const isInline = !classNameValue;
            return isInline ? (
              <code className="rounded bg-black/25 px-1 py-0.5 text-cyan-100" {...props} />
            ) : (
              <code className="block overflow-x-auto rounded-xl bg-black/30 p-2 text-cyan-50" {...props} />
            );
          },
          a: (props) => (
            <a
              className="text-cyan-200 underline underline-offset-2"
              target="_blank"
              rel="noreferrer"
              {...props}
            />
          ),
          table: (props) => <table className="my-2 w-full border-collapse" {...props} />,
          th: (props) => <th className="border border-white/20 px-2 py-1 text-left" {...props} />,
          td: (props) => <td className="border border-white/10 px-2 py-1" {...props} />,
        }}
      >
        {content || ""}
      </ReactMarkdown>
    </div>
  );
}
