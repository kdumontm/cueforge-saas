'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Tag, Loader2 } from 'lucide-react';
import type { BlogPost } from '@/types';

export default function BlogPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        const response = await fetch('/api/v1/blog?limit=100');
        if (!response.ok) throw new Error('Erreur lors du chargement des articles');
        const data = await response.json();
        setPosts(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
      } finally {
        setLoading(false);
      }
    };

    fetchPosts();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <Loader2 className="animate-spin text-[var(--accent)]" size={48} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
            Erreur lors du chargement du blog
          </h2>
          <p className="text-[var(--text-secondary)]">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Header */}
      <div className="bg-gradient-to-br from-[var(--accent)] to-purple-600 py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">
            Blog CueForge
          </h1>
          <p className="text-xl text-white/80">
            Tips, tutoriels et actualités pour optimiser votre workflow DJ
          </p>
        </div>
      </div>

      {/* Articles Grid */}
      <div className="max-w-6xl mx-auto px-4 py-12">
        {posts.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-[var(--text-secondary)] text-lg">
              Aucun article pour le moment. Revenez bientôt!
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <article
                key={post.id}
                onClick={() => router.push(`/blog/${post.slug}`)}
                className="group cursor-pointer bg-[var(--bg-secondary)] rounded-lg overflow-hidden border border-[var(--border-color)] hover:border-[var(--accent)] transition-all duration-300 hover:shadow-lg hover:shadow-[var(--accent)]/20"
              >
                {/* Cover Image */}
                {post.cover_image_url ? (
                  <div className="w-full h-48 overflow-hidden bg-gradient-to-br from-[var(--accent)] to-purple-600">
                    <img
                      src={post.cover_image_url}
                      alt={post.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  </div>
                ) : (
                  <div className="w-full h-48 bg-gradient-to-br from-[var(--accent)] to-purple-600 opacity-80" />
                )}

                {/* Content */}
                <div className="p-5">
                  {/* Title */}
                  <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2 line-clamp-2 group-hover:text-[var(--accent)] transition-colors">
                    {post.title}
                  </h2>

                  {/* Excerpt */}
                  {post.excerpt && (
                    <p className="text-sm text-[var(--text-secondary)] mb-4 line-clamp-2">
                      {post.excerpt}
                    </p>
                  )}

                  {/* Tags */}
                  {post.tags && post.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {post.tags.slice(0, 2).map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--accent)]/10 text-[var(--accent)] text-xs rounded-full border border-[var(--accent)]/30"
                        >
                          <Tag size={12} />
                          {tag}
                        </span>
                      ))}
                      {post.tags.length > 2 && (
                        <span className="text-xs text-[var(--text-secondary)]">
                          +{post.tags.length - 2}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Meta */}
                  <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                    {post.author && <span>{post.author}</span>}
                    {post.published_at && (
                      <div className="flex items-center gap-1">
                        <Calendar size={12} />
                        {new Date(post.published_at).toLocaleDateString('fr-FR')}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
