"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Search, MessageSquare, Tag, Clock, Eye, X,
} from "lucide-react";
import {
  Input, Select, Btn, Card, Badge, PageWrapper,
  SectionHeader, LoadingScreen, EmptyState, useToast, StatCard,
} from "../_components/shared";
import { adminApi } from "../_components/api";

interface TimelineEvent {
  id: number;
  event_type: string;
  title: string;
  description: string;
  timestamp: string;
  metadata?: any;
}

interface Stats {
  total_events: number;
  last_active: string;
  session_count: number;
  avg_session_duration: number;
}

interface Session {
  id: number;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  pages_visited: number;
  ip_address: string;
}

interface UserNote {
  id: number;
  content: string;
  created_at: string;
  created_by: string;
}

export default function UserTimelinePage() {
  const { toast } = useToast();
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeView, setActiveView] = useState<"timeline" | "sessions" | "notes">("timeline");

  // Timeline data
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

  // Sessions
  const [sessions, setSessions] = useState<Session[]>([]);
  const [expandedSession, setExpandedSession] = useState<number | null>(null);

  // Notes
  const [notes, setNotes] = useState<UserNote[]>([]);
  const [newNote, setNewNote] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);

  // Tags
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [tagLoading, setTagLoading] = useState(false);

  const loadUserTimeline = useCallback(async () => {
    if (!userId) {
      toast("Veuillez entrer un ID utilisateur", "error");
      return;
    }
    try {
      setLoading(true);
      const [timelineRes, statsRes, sessionsRes, notesRes, tagsRes] = await Promise.all([
        adminApi.getUserTimeline(parseInt(userId)),
        adminApi.getUserTimelineStats(parseInt(userId)),
        adminApi.getUserSessions(parseInt(userId)),
        adminApi.getUserNotes(parseInt(userId)),
        adminApi.getUserTags(parseInt(userId)),
      ]);
      setTimeline(timelineRes.events || []);
      setStats(statsRes);
      setSessions(sessionsRes.sessions || []);
      setNotes(notesRes.notes || []);
      setTags(tagsRes.tags || []);
      toast("Données chargées", "success");
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  }, [userId, toast]);

  const handleAddNote = async () => {
    if (!newNote.trim()) {
      toast("Veuillez entrer une note", "error");
      return;
    }
    try {
      setNoteLoading(true);
      await adminApi.addUserNote(parseInt(userId), { content: newNote });
      setNewNote("");
      toast("Note ajoutée", "success");
      loadUserTimeline();
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setNoteLoading(false);
    }
  };

  const handleAddTag = async () => {
    if (!newTag.trim()) {
      toast("Veuillez entrer un tag", "error");
      return;
    }
    try {
      setTagLoading(true);
      const newTags = [...tags, newTag];
      await adminApi.updateUserTags(parseInt(userId), { tags: newTags });
      setNewTag("");
      setTags(newTags);
      toast("Tag ajouté", "success");
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setTagLoading(false);
    }
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    try {
      const newTags = tags.filter((t) => t !== tagToRemove);
      await adminApi.updateUserTags(parseInt(userId), { tags: newTags });
      setTags(newTags);
      toast("Tag supprimé", "success");
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    }
  };

  return (
    <PageWrapper>
      <SectionHeader
        title="Timeline utilisateur"
        desc="Activité, sessions, notes et tags"
      />

      {/* User ID Input */}
      <Card className="mb-6">
        <div className="p-6">
          <div className="flex gap-2">
            <Input
              type="number"
              placeholder="ID utilisateur"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="flex-1"
            />
            <Btn variant="primary" onClick={loadUserTimeline} disabled={!userId}>
              <Search className="w-4 h-4" /> Charger
            </Btn>
          </div>
        </div>
      </Card>

      {!userId || loading ? (
        <div className="p-8 text-center text-gray-400">
          {!userId
            ? "Veuillez entrer un ID utilisateur"
            : "Chargement..."}
        </div>
      ) : (
        <>
          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <StatCard
                label="Événements"
                value={stats.total_events.toString()}
              />
              <StatCard
                label="Dernier actif"
                value={new Date(stats.last_active).toLocaleDateString("fr-FR")}
              />
              <StatCard
                label="Sessions"
                value={stats.session_count.toString()}
              />
              <StatCard
                label="Durée moyenne"
                value={`${Math.round(stats.avg_session_duration / 60)}m`}
              />
            </div>
          )}

          {/* View Tabs */}
          <div className="flex gap-2 mb-6 border-b border-gray-700">
            {["timeline", "sessions", "notes"].map((view) => (
              <button
                key={view}
                onClick={() => setActiveView(view as any)}
                className={`px-4 py-2 font-medium text-sm transition-colors ${
                  activeView === view
                    ? "text-purple-400 border-b-2 border-purple-600"
                    : "text-gray-400 hover:text-gray-300"
                }`}
              >
                {view === "timeline" && "Timeline"}
                {view === "sessions" && "Sessions"}
                {view === "notes" && "Notes & Tags"}
              </button>
            ))}
          </div>

          {/* Timeline View */}
          {activeView === "timeline" && (
            <Card>
              <div className="p-6">
                <h3 className="text-white font-semibold mb-4">Activité chronologique</h3>
                {timeline.length === 0 ? (
                  <EmptyState title="Aucun événement" desc="Aucune activité enregistrée" />
                ) : (
                  <div className="space-y-4">
                    {timeline.map((event) => (
                      <div
                        key={event.id}
                        className="flex gap-4 bg-[#0a0a1a] p-4 rounded border border-gray-700"
                      >
                        <div className="flex-shrink-0">
                          <div className="w-2 h-2 rounded-full bg-purple-600 mt-2" />
                        </div>
                        <div className="flex-1">
                          <p className="text-white font-medium">{event.title}</p>
                          <p className="text-gray-400 text-sm">{event.description}</p>
                          <p className="text-gray-500 text-xs mt-1">
                            {new Date(event.timestamp).toLocaleString("fr-FR")}
                          </p>
                        </div>
                        <Badge variant="info">{event.event_type}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Sessions View */}
          {activeView === "sessions" && (
            <Card>
              <div className="p-6">
                <h3 className="text-white font-semibold mb-4">Sessions</h3>
                {sessions.length === 0 ? (
                  <EmptyState title="Aucune session" desc="Aucune session enregistrée" />
                ) : (
                  <div className="space-y-2">
                    {sessions.map((session) => (
                      <div key={session.id}>
                        <button
                          onClick={() =>
                            setExpandedSession(
                              expandedSession === session.id ? null : session.id
                            )
                          }
                          className="w-full flex items-center justify-between bg-[#0a0a1a] p-4 rounded border border-gray-700 hover:border-gray-600 transition-colors"
                        >
                          <div className="text-left flex-1">
                            <p className="text-white font-medium">
                              {new Date(session.started_at).toLocaleString("fr-FR")}
                            </p>
                            <p className="text-gray-400 text-sm">
                              {Math.round(session.duration_seconds / 60)}m •{" "}
                              {session.pages_visited} pages
                            </p>
                          </div>
                          {expandedSession === session.id ? (
                            <ChevronUp className="w-5 h-5 text-gray-400" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-gray-400" />
                          )}
                        </button>
                        {expandedSession === session.id && (
                          <div className="bg-[#0a0a1a] p-4 border border-gray-700 border-t-0 rounded-b">
                            <p className="text-gray-400 text-sm">
                              IP: <span className="text-gray-300">{session.ip_address}</span>
                            </p>
                            <p className="text-gray-400 text-sm mt-1">
                              Fin: <span className="text-gray-300">
                                {new Date(session.ended_at).toLocaleString("fr-FR")}
                              </span>
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Notes & Tags View */}
          {activeView === "notes" && (
            <div className="space-y-6">
              {/* Tags Section */}
              <Card>
                <div className="p-6">
                  <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                    <Tag className="w-5 h-5" /> Tags
                  </h3>
                  <div className="flex gap-2 mb-4 flex-wrap">
                    {tags.map((tag) => (
                      <div
                        key={tag}
                        className="flex items-center gap-2 bg-purple-600/20 px-3 py-1 rounded-full"
                      >
                        <span className="text-purple-300 text-sm">{tag}</span>
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          className="text-purple-400 hover:text-purple-300"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      placeholder="Nouveau tag"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyPress={(e) => e.key === "Enter" && handleAddTag()}
                    />
                    <Btn
                      variant="primary"
                      onClick={handleAddTag}
                      disabled={tagLoading}
                    >
                      <Tag className="w-4 h-4" /> Ajouter
                    </Btn>
                  </div>
                </div>
              </Card>

              {/* Notes Section */}
              <Card>
                <div className="p-6">
                  <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                    <MessageSquare className="w-5 h-5" /> Notes admin
                  </h3>
                  <div className="mb-4">
                    <textarea
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Ajouter une note..."
                      className="w-full bg-[#0a0a1a] text-white border border-gray-700 rounded px-3 py-2 text-sm placeholder-gray-500 focus:outline-none focus:border-purple-600"
                      rows={3}
                    />
                    <Btn
                      variant="primary"
                      onClick={handleAddNote}
                      disabled={noteLoading}
                      className="mt-2"
                    >
                      <MessageSquare className="w-4 h-4" /> Ajouter une note
                    </Btn>
                  </div>

                  {notes.length === 0 ? (
                    <EmptyState title="Aucune note" desc="Aucune note admin ajoutée" />
                  ) : (
                    <div className="space-y-3">
                      {notes.map((note) => (
                        <div
                          key={note.id}
                          className="bg-[#0a0a1a] p-4 rounded border border-gray-700"
                        >
                          <p className="text-white text-sm">{note.content}</p>
                          <p className="text-gray-500 text-xs mt-2">
                            Par {note.created_by} •{" "}
                            {new Date(note.created_at).toLocaleString("fr-FR")}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            </div>
          )}
        </>
      )}
    </PageWrapper>
  );
}

// Helper component
const ChevronDown = ({ className }: { className: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
  </svg>
);

const ChevronUp = ({ className }: { className: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
  </svg>
);
