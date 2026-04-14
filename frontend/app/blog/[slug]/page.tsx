'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Loader2, Share2, Copy, Check } from 'lucide-react';
import type { BlogPost } from '@/types';

interface MarkdownParseResult {
  html: string;
}

// Simple markdown parser without external libraries
function parseMarkdown(markdown: string): MarkdownParseResult {
  let html = markdown;

  // Headings (##, ###, ####)
  html = html.replace(/^#### (.*?)$/gm, '<h4 class="text-xl font-bold mt-6 mb-3">$1</h4>');
  html = html.replace(/^### (.*?)$/gm, '<h3 class="text-2xl font-bold mt-6 mb-3">$1</h3>');
  html = html.replace(/^## (.*?)$/gm, '<h2 class="text-3xl font-bold mt-8 mb-4">$1</h2>');
  html = html.replace(/^# (.*?)$/gm, '<h1 class="text-4xl font-bold mt-8 mb-4">$1</h1>');

  // Bold text (**text**)
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold">$1</strong>');

  // Italic text (*text*)
  html = html.replace(/\*(.*?)\*/g, '<em class="italic">$1</em>');

  // Paragraphs
  const lines = html.split('\n');
  let inParagraph = false;
  let paragraphContent = '';
  const result: string[] = [];

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (trimmed === '') {
      if (inParagraph) {
        result.push(`<p class="mb-4">${paragraphContent}</p>`);
        paragraphContent = '';
        inParagraph = false;
      }
    } else if (trimmed.startsWith('<h') || trimmed.startsWith('<li')) {
      if (inParagraph) {
        result.push(`<p class="mb-4">${paragraphContent}</p>`);
        paragraphContent = '';
        inParagraph = false;
      }
      result.push(trimmed);
    } else {
      if (!inParagraph) {
        inParagraph = true;
        paragraphContent = trimmed;
      } else {
        paragraphContent += ' ' + trimmed;
      }
    }
  });

  if (inParagraph) {
    result.push(`<p class="mb-4">${paragraphContent}</p>`);
  }

  html = result.join('\n');

  // Lists
  html = html.replace(/^- (.*?)$/gm, '<li class="ml-4 list-disc">$1</li>');
  html = html.replace(/(<li class="ml-4 list-disc">[\s\S]*?<\/li>)/, '<ul class="mb-4">$1</ul>');

  // Code blocks (```code```)
  html = html.replace(
    /```([\s\S]*?)```/g,
    '<pre class="bg-[var(--bg-primary)] p-4 rounded-lg mb-4 overflow-x-auto border border-[var(--border-color)]"><code class="text-sm text-[var(--text-secondary)]">$1</code></pre>'
  );

  // Inline code (`code`)
  html = html.replace(
    /`(.*?)`/g,
    '<code class="bg-[var(--bg-primary)] px-2 py-1 rounded font-mono text-sm">$1</code>'
  );

  return { html };
}

export default function BlogPostPage() {
  const router = useRouter();
  const params = useParams();
  const slug = params?.slug as string;

  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!slug) return;

    const fetchPost = async () => {
      try {
        const response = await fetch(`/api/v1/blog/${slug}`);
        if (!response.ok) throw new Error('Article non trouvé');
        const data = await response.json();
        setPost(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
      } finally {
        setLoading(false);
      }
    };

    fetchPost();
  }, [slug]);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: post?.title,
          text: post?.excerpt,
          url,
        });
      } catch (err) {
        // Fallback to copy
        copyToClipboard(url);
      }
    } else {
      copyToClipboard(url);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <Loader2 className="animate-spin text-[var(--accent)]" size={48} />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)]">
        <div className="max-w-3xl mx-auto px-4 py-12">
          <button
            onClick={() => router.push('/blog')}
            className="flex items-center gap-2 text-[var(--accent)] hover:text-[var(--accent-hover)] mb-8 transition-colors"
          >
            <ArrowLeft size={20} />
            Retour au blog
          </button>
          <div className="text-center py-16">
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
              Article non trouvé
            </h2>
            <p className="text-[var(--text-secondary)]">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const parsedContent = parseMarkdown(post.content || "");

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Header with back button */}
      <div className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <button
            onClick={() => router.push('/blog')}
            className="flex items-center gap-2 text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
          >
            <ArrowLeft size={20} />
            Retour au blog
          </button>
        </div>
      </div>

      {/* Article */}
      <article className="max-w-3xl mx-auto px-4 py-12">
        {/* Title */}
        <h1 className="text-4xl sm:text-5xl font-bold text-[var(--text-primary)] mb-6">
          {post.title}
        </h1>

        {/* Meta */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8 pb-8 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2 text-[var(--text-secondary)] text-sm">
            {post.author && (
              <>
                <span className="font-medium">{post.author}</span>
                <span>•</span>
              </>
            )}
            {post.published_at && (
              <span>{new Date(post.published_at).toLocaleDateString('fr-FR')}</span>
            )}
          </div>

          {/* Share button */}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={handleShare}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors text-sm"
            >
              {copied ? (
                <>
                  <Check size={16} />
                  Copié!
                </>
              ) : (
                <>
                  <Share2 size={16} />
                  Partager
                </>
              )}
            </button>
          </div>
        </div>

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-8">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="px-3 py-1 bg-[var(--accent)]/10 text-[var(--accent)] text-xs rounded-full border border-[var(--accent)]/30"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="prose dark:prose-invert max-w-none mb-12 text-[var(--text-primary)]">
          <div
            dangerouslySetInnerHTML={{ __html: parsedContent.html }}
            className="space-y-4"
          />
        </div>

        {/* Back to blog link */}
        <div className="pt-8 border-t border-[var(--border-color)]">
          <button
            onClick={() => router.push('/blog')}
            className="text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
          >
            ← Retour à tous les articles
          </button>
        </div>
      </article>
    </div>
  );
}
