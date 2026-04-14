'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Copy, Check } from 'lucide-react';

type Section =
  | 'introduction'
  | 'authentication'
  | 'tracks'
  | 'analysis'
  | 'export'
  | 'playlists'
  | 'webhooks'
  | 'rate-limits';

interface CodeExample {
  language: string;
  code: string;
}

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState<Section>('introduction');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const sections: { id: Section; title: string; icon: string }[] = [
    { id: 'introduction', title: 'Introduction', icon: '📘' },
    { id: 'authentication', title: 'Authentication', icon: '🔐' },
    { id: 'tracks', title: 'Tracks', icon: '🎵' },
    { id: 'analysis', title: 'Analysis', icon: '📊' },
    { id: 'export', title: 'Export', icon: '💾' },
    { id: 'playlists', title: 'Playlists', icon: '📋' },
    { id: 'webhooks', title: 'Webhooks', icon: '🔗' },
    { id: 'rate-limits', title: 'Rate Limits', icon: '⚡' },
  ];

  const copyToClipboard = (code: string, codeId: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(codeId);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const CodeBlock = ({
    code,
    language,
    codeId
  }: {
    code: string;
    language: string;
    codeId: string;
  }) => (
    <div className="bg-slate-900 rounded-lg p-4 my-4 relative">
      <div className="flex justify-between items-center mb-3">
        <span className="text-xs font-mono text-slate-400 uppercase">{language}</span>
        <button
          onClick={() => copyToClipboard(code, codeId)}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition"
        >
          {copiedCode === codeId ? (
            <>
              <Check size={14} /> Copied
            </>
          ) : (
            <>
              <Copy size={14} /> Copy
            </>
          )}
        </button>
      </div>
      <pre className="text-sm text-slate-100 overflow-x-auto font-mono">
        <code>{code}</code>
      </pre>
    </div>
  );

  const MethodBadge = ({ method }: { method: 'GET' | 'POST' | 'PATCH' | 'DELETE' }) => {
    const colors = {
      GET: 'bg-green-900 text-green-200',
      POST: 'bg-blue-900 text-blue-200',
      PATCH: 'bg-orange-900 text-orange-200',
      DELETE: 'bg-red-900 text-red-200',
    };
    return (
      <span className={`inline-block px-3 py-1 rounded font-mono text-sm font-bold ${colors[method]}`}>
        {method}
      </span>
    );
  };

  const Endpoint = ({
    method,
    path,
    description,
    params,
    example,
  }: {
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    path: string;
    description: string;
    params?: { name: string; type: string; description: string }[];
    example: CodeExample;
  }) => (
    <div className="my-8 p-6 bg-slate-800 rounded-lg border border-slate-700">
      <div className="flex items-center gap-3 mb-3">
        <MethodBadge method={method} />
        <code className="text-sm font-mono text-slate-300">{path}</code>
      </div>
      <p className="text-slate-400 mb-4">{description}</p>
      {params && (
        <div className="mb-4">
          <h5 className="text-sm font-semibold text-slate-300 mb-2">Parameters:</h5>
          <div className="space-y-2">
            {params.map((p) => (
              <div key={p.name} className="text-sm text-slate-400">
                <span className="font-mono text-slate-200">{p.name}</span>
                <span className="text-slate-500 ml-2">({p.type})</span>
                <p className="text-slate-500 ml-2">{p.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      <CodeBlock
        code={example.code}
        language={example.language}
        codeId={`${method}-${path}`}
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <div className="bg-slate-900/80 backdrop-blur border-b border-slate-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <Link href="/" className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-300 transition">
            <ChevronRight size={16} className="rotate-180" />
            Back to Home
          </Link>
        </div>
      </div>

      <div className="flex max-w-7xl mx-auto">
        {/* Sidebar */}
        <aside className="w-64 border-r border-slate-800 p-6 hidden lg:block sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Documentation</h3>
          <nav className="space-y-1">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full text-left px-3 py-2 rounded text-sm transition flex items-center gap-2 ${
                  activeSection === section.id
                    ? 'bg-slate-700 text-slate-100 font-semibold'
                    : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span>{section.icon}</span>
                {section.title}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 px-6 py-8 lg:px-8 max-w-4xl">
          {/* Introduction */}
          {activeSection === 'introduction' && (
            <div>
              <h1 className="text-4xl font-bold text-slate-100 mb-4">TrackCue API Documentation</h1>
              <p className="text-lg text-slate-400 mb-6">
                Welcome to the TrackCue API. Our API provides powerful tools for DJs to analyze, manage, and export their music library programmatically.
              </p>

              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 mb-6">
                <h3 className="text-lg font-semibold text-slate-200 mb-4">Quick Start</h3>
                <div className="space-y-3 text-slate-400">
                  <p>• Base URL: <code className="bg-slate-900 px-2 py-1 rounded text-slate-200">https://api.trackcue.app/api/v1</code></p>
                  <p>• Authentication: JWT Token or API Key (header: <code className="bg-slate-900 px-2 py-1 rounded text-slate-200">X-API-Key</code>)</p>
                  <p>• Format: JSON</p>
                  <p>• Rate Limits: See Rate Limits section</p>
                </div>
              </div>

              <h2 className="text-2xl font-semibold text-slate-200 mt-8 mb-4">Features</h2>
              <ul className="space-y-3 text-slate-400">
                <li className="flex gap-2">
                  <span className="text-emerald-400">✓</span>
                  <span>Upload and analyze audio tracks (identify artist, BPM, key, etc.)</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-400">✓</span>
                  <span>Manage cue points, hot cues, and loop markers</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-400">✓</span>
                  <span>Create and organize playlists</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-400">✓</span>
                  <span>Export to Rekordbox, Serato, Traktor, VirtualDJ</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-400">✓</span>
                  <span>Webhooks for real-time event notifications</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-400">✓</span>
                  <span>API Keys for programmatic access</span>
                </li>
              </ul>
            </div>
          )}

          {/* Authentication */}
          {activeSection === 'authentication' && (
            <div>
              <h1 className="text-4xl font-bold text-slate-100 mb-6">Authentication</h1>
              <p className="text-slate-400 mb-6">
                TrackCue API supports two authentication methods: JWT tokens (session-based) and API Keys (programmatic).
              </p>

              <h2 className="text-2xl font-semibold text-slate-200 mb-4">JWT Token (Session)</h2>
              <p className="text-slate-400 mb-4">
                Use JWT tokens for browser-based authentication. Tokens are obtained via login and included in the Authorization header.
              </p>
              <CodeBlock
                code={`curl -X POST https://api.trackcue.app/api/v1/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "user@example.com",
    "password": "yourpassword"
  }'

# Response includes 'access_token'
# Use it in subsequent requests:
curl -H "Authorization: Bearer YOUR_TOKEN" \\
  https://api.trackcue.app/api/v1/tracks`}
                language="bash"
                codeId="jwt-auth"
              />

              <h2 className="text-2xl font-semibold text-slate-200 mt-8 mb-4">API Keys (Programmatic)</h2>
              <p className="text-slate-400 mb-4">
                API Keys are ideal for programmatic access. Create keys in your dashboard and use the X-API-Key header.
              </p>
              <CodeBlock
                code={`# Create an API key via dashboard or API
curl -X POST https://api.trackcue.app/api/v1/api-keys \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "My CLI Tool",
    "permissions": ["tracks:read", "tracks:write"],
    "expires_in_days": 365
  }'

# Use the key in requests
curl -H "X-API-Key: your_secret_key" \\
  https://api.trackcue.app/api/v1/tracks`}
                language="bash"
                codeId="api-key-auth"
              />

              <h2 className="text-2xl font-semibold text-slate-200 mt-8 mb-4">API Key Permissions</h2>
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 mt-4 space-y-2 text-slate-400">
                <p><code className="bg-slate-900 px-2 py-1 rounded">tracks:read</code> - Read track data</p>
                <p><code className="bg-slate-900 px-2 py-1 rounded">tracks:write</code> - Create/update tracks</p>
                <p><code className="bg-slate-900 px-2 py-1 rounded">analysis:read</code> - Read analysis data</p>
                <p><code className="bg-slate-900 px-2 py-1 rounded">playlists:read</code> - Read playlists</p>
                <p><code className="bg-slate-900 px-2 py-1 rounded">playlists:write</code> - Create/update playlists</p>
                <p><code className="bg-slate-900 px-2 py-1 rounded">export:read</code> - Export data</p>
              </div>
            </div>
          )}

          {/* Tracks */}
          {activeSection === 'tracks' && (
            <div>
              <h1 className="text-4xl font-bold text-slate-100 mb-6">Tracks</h1>
              <p className="text-slate-400 mb-6">
                The Tracks API allows you to upload, retrieve, and manage your music tracks.
              </p>

              <Endpoint
                method="GET"
                path="/api/v1/tracks"
                description="List all tracks for the current user"
                params={[
                  { name: 'skip', type: 'integer', description: 'Number of tracks to skip (pagination)' },
                  { name: 'limit', type: 'integer', description: 'Number of tracks to return (max 100)' },
                ]}
                example={{
                  language: 'bash',
                  code: `curl -H "Authorization: Bearer YOUR_TOKEN" \\
  "https://api.trackcue.app/api/v1/tracks?skip=0&limit=20"`,
                }}
              />

              <Endpoint
                method="GET"
                path="/api/v1/tracks/{id}"
                description="Get details of a specific track"
                params={[
                  { name: 'id', type: 'integer', description: 'Track ID' },
                ]}
                example={{
                  language: 'bash',
                  code: `curl -H "Authorization: Bearer YOUR_TOKEN" \\
  https://api.trackcue.app/api/v1/tracks/123`,
                }}
              />

              <Endpoint
                method="POST"
                path="/api/v1/tracks/upload"
                description="Upload a new track (multipart/form-data)"
                params={[
                  { name: 'file', type: 'binary', description: 'Audio file (MP3, WAV, FLAC, etc.)' },
                ]}
                example={{
                  language: 'bash',
                  code: `curl -X POST \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -F "file=@/path/to/track.mp3" \\
  https://api.trackcue.app/api/v1/tracks/upload`,
                }}
              />

              <Endpoint
                method="PATCH"
                path="/api/v1/tracks/{id}"
                description="Update track metadata"
                params={[
                  { name: 'id', type: 'integer', description: 'Track ID' },
                ]}
                example={{
                  language: 'bash',
                  code: `curl -X PATCH \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "New Title",
    "artist": "New Artist",
    "bpm": 128,
    "key": "C minor",
    "genre": "House"
  }' \\
  https://api.trackcue.app/api/v1/tracks/123`,
                }}
              />
            </div>
          )}

          {/* Analysis */}
          {activeSection === 'analysis' && (
            <div>
              <h1 className="text-4xl font-bold text-slate-100 mb-6">Analysis</h1>
              <p className="text-slate-400 mb-6">
                Analyze tracks to extract metadata: artist, BPM, key, genre, and more using AcoustID, MusicBrainz, Spotify, and Last.fm.
              </p>

              <Endpoint
                method="POST"
                path="/api/v1/tracks/{id}/analyze"
                description="Start analysis of a track"
                params={[
                  { name: 'id', type: 'integer', description: 'Track ID' },
                ]}
                example={{
                  language: 'bash',
                  code: `curl -X POST \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  https://api.trackcue.app/api/v1/tracks/123/analyze`,
                }}
              />

              <Endpoint
                method="GET"
                path="/api/v1/tracks/{id}/analysis"
                description="Get analysis results for a track"
                params={[
                  { name: 'id', type: 'integer', description: 'Track ID' },
                ]}
                example={{
                  language: 'bash',
                  code: `curl -H "Authorization: Bearer YOUR_TOKEN" \\
  https://api.trackcue.app/api/v1/tracks/123/analysis

# Response example:
# {
#   "id": 123,
#   "title": "Midnight Dreams",
#   "artist": "The Synthetics",
#   "bpm": 128,
#   "key": "A minor",
#   "genre": "Synthwave",
#   "energy": 0.85,
#   "danceability": 0.92,
#   "mood": "dark"
# }`,
                }}
              />
            </div>
          )}

          {/* Export */}
          {activeSection === 'export' && (
            <div>
              <h1 className="text-4xl font-bold text-slate-100 mb-6">Export</h1>
              <p className="text-slate-400 mb-6">
                Export your library to popular DJ software formats: Rekordbox, Serato, Traktor, and VirtualDJ.
              </p>

              <Endpoint
                method="GET"
                path="/api/v1/export/rekordbox"
                description="Export library as Rekordbox XML"
                example={{
                  language: 'bash',
                  code: `curl -H "Authorization: Bearer YOUR_TOKEN" \\
  https://api.trackcue.app/api/v1/export/rekordbox > library.xml`,
                }}
              />

              <Endpoint
                method="GET"
                path="/api/v1/export/serato"
                description="Export library in Serato format"
                example={{
                  language: 'bash',
                  code: `curl -H "Authorization: Bearer YOUR_TOKEN" \\
  https://api.trackcue.app/api/v1/export/serato > library.crates`,
                }}
              />

              <Endpoint
                method="GET"
                path="/api/v1/export/traktor"
                description="Export library in Traktor NML format"
                example={{
                  language: 'bash',
                  code: `curl -H "Authorization: Bearer YOUR_TOKEN" \\
  https://api.trackcue.app/api/v1/export/traktor > collection.nml`,
                }}
              />
            </div>
          )}

          {/* Playlists */}
          {activeSection === 'playlists' && (
            <div>
              <h1 className="text-4xl font-bold text-slate-100 mb-6">Playlists</h1>
              <p className="text-slate-400 mb-6">
                Create, manage, and organize playlists of your tracks.
              </p>

              <Endpoint
                method="GET"
                path="/api/v1/playlists"
                description="List all playlists"
                example={{
                  language: 'bash',
                  code: `curl -H "Authorization: Bearer YOUR_TOKEN" \\
  https://api.trackcue.app/api/v1/playlists`,
                }}
              />

              <Endpoint
                method="POST"
                path="/api/v1/playlists"
                description="Create a new playlist"
                example={{
                  language: 'bash',
                  code: `curl -X POST \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Deep House Mix",
    "description": "My favorite deep house tracks"
  }' \\
  https://api.trackcue.app/api/v1/playlists`,
                }}
              />

              <Endpoint
                method="POST"
                path="/api/v1/playlists/{id}/tracks"
                description="Add a track to a playlist"
                params={[
                  { name: 'id', type: 'integer', description: 'Playlist ID' },
                ]}
                example={{
                  language: 'bash',
                  code: `curl -X POST \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"track_id": 456}' \\
  https://api.trackcue.app/api/v1/playlists/789/tracks`,
                }}
              />
            </div>
          )}

          {/* Webhooks */}
          {activeSection === 'webhooks' && (
            <div>
              <h1 className="text-4xl font-bold text-slate-100 mb-6">Webhooks</h1>
              <p className="text-slate-400 mb-6">
                Webhooks allow you to receive real-time notifications for events in your TrackCue account.
              </p>

              <h2 className="text-2xl font-semibold text-slate-200 mb-4">Setting Up Webhooks</h2>

              <Endpoint
                method="POST"
                path="/api/v1/webhooks"
                description="Create a new webhook"
                example={{
                  language: 'bash',
                  code: `curl -X POST \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://example.com/webhook",
    "events": ["track.analyzed", "track.uploaded"]
  }' \\
  https://api.trackcue.app/api/v1/webhooks`,
                }}
              />

              <h2 className="text-2xl font-semibold text-slate-200 mt-8 mb-4">Available Events</h2>
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 space-y-2 text-slate-400">
                <p><code className="bg-slate-900 px-2 py-1 rounded">track.uploaded</code> - New track uploaded</p>
                <p><code className="bg-slate-900 px-2 py-1 rounded">track.analyzed</code> - Track analysis complete</p>
                <p><code className="bg-slate-900 px-2 py-1 rounded">export.completed</code> - Library export finished</p>
              </div>

              <h2 className="text-2xl font-semibold text-slate-200 mt-8 mb-4">Webhook Payload</h2>
              <p className="text-slate-400 mb-4">
                All webhooks are sent as POST requests with the following structure:
              </p>
              <CodeBlock
                code={`{
  "event": "track.analyzed",
  "timestamp": "2024-04-07T14:30:00",
  "data": {
    "track_id": 123,
    "title": "Midnight Dreams",
    "artist": "The Synthetics",
    "bpm": 128,
    "key": "A minor",
    "genre": "Synthwave"
  }
}`}
                language="json"
                codeId="webhook-payload"
              />

              <h2 className="text-2xl font-semibold text-slate-200 mt-8 mb-4">Verifying Webhooks</h2>
              <p className="text-slate-400 mb-4">
                Each webhook includes a <code className="bg-slate-900 px-2 py-1 rounded">X-TrackCue-Signature</code> header containing an HMAC-SHA256 signature of the request body.
              </p>
              <CodeBlock
                code={`import hashlib
import hmac

def verify_webhook(body: bytes, signature: str, secret: str) -> bool:
    """Verify webhook signature."""
    expected_signature = hmac.new(
        secret.encode(),
        body,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected_signature)

# In your webhook handler:
# signature = request.headers['X-TrackCue-Signature']
# is_valid = verify_webhook(request.body, signature, webhook_secret)`}
                language="python"
                codeId="verify-webhook"
              />
            </div>
          )}

          {/* Rate Limits */}
          {activeSection === 'rate-limits' && (
            <div>
              <h1 className="text-4xl font-bold text-slate-100 mb-6">Rate Limits</h1>
              <p className="text-slate-400 mb-6">
                API requests are rate-limited based on your subscription plan. Rate limit information is included in response headers.
              </p>

              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 mb-6">
                <h3 className="text-lg font-semibold text-slate-200 mb-4">Rate Limit Headers</h3>
                <div className="space-y-3 text-slate-400 text-sm font-mono">
                  <p><span className="text-slate-200">X-RateLimit-Limit:</span> Maximum requests per minute</p>
                  <p><span className="text-slate-200">X-RateLimit-Remaining:</span> Requests remaining in current window</p>
                  <p><span className="text-slate-200">X-RateLimit-Reset:</span> Unix timestamp when limit resets</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-slate-200 mb-3">Free Plan</h3>
                  <ul className="space-y-2 text-slate-400">
                    <li>• 60 requests per minute</li>
                    <li>• 1,000 requests per day</li>
                    <li>• 500 MB storage</li>
                  </ul>
                </div>

                <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-slate-200 mb-3">Pro Plan</h3>
                  <ul className="space-y-2 text-slate-400">
                    <li>• 300 requests per minute</li>
                    <li>• Unlimited daily requests</li>
                    <li>• 50 GB storage</li>
                  </ul>
                </div>

                <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-slate-200 mb-3">Unlimited Plan</h3>
                  <ul className="space-y-2 text-slate-400">
                    <li>• Unlimited requests</li>
                    <li>• Priority support</li>
                    <li>• Unlimited storage</li>
                  </ul>
                </div>
              </div>

              <h2 className="text-2xl font-semibold text-slate-200 mt-8 mb-4">Handling Rate Limits</h2>
              <p className="text-slate-400 mb-4">
                When you exceed the rate limit, the API returns a 429 Too Many Requests response. Implement exponential backoff:
              </p>
              <CodeBlock
                code={`import time

def make_request_with_retry(url, headers, max_retries=3):
    for attempt in range(max_retries):
        response = requests.get(url, headers=headers)

        if response.status_code != 429:
            return response

        # Calculate backoff time
        wait_time = 2 ** attempt  # 1s, 2s, 4s
        print(f"Rate limited. Waiting {wait_time}s before retry...")
        time.sleep(wait_time)

    raise Exception("Max retries exceeded")`}
                language="python"
                codeId="rate-limit-retry"
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
