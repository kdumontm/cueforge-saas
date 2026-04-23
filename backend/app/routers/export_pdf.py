"""Export track analysis as PDF."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import io
from datetime import datetime

try:
    from reportlab.lib.pagesizes import letter, A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image
    from reportlab.lib import colors
    HAS_REPORTLAB = True
except ImportError:
    HAS_REPORTLAB = False
    try:
        from fpdf import FPDF
        HAS_FPDF = True
    except ImportError:
        HAS_FPDF = False

from app.database import get_db
from app.models.track import Track
from app.models.library import Playlist
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/export", tags=["export"])


def create_pdf_reportlab(tracks: list[Track]) -> io.BytesIO:
    """Create PDF using reportlab."""
    if not HAS_REPORTLAB:
        raise HTTPException(status_code=500, detail="PDF library not available")

    # Create PDF in memory
    pdf_buffer = io.BytesIO()
    doc = SimpleDocTemplate(pdf_buffer, pagesize=A4)
    story = []

    # Styles
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#a855f7'),
        spaceAfter=12,
        fontName='Helvetica-Bold',
    )
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.HexColor('#a855f7'),
        spaceAfter=10,
        fontName='Helvetica-Bold',
    )

    # Header
    story.append(Paragraph("TrackCue", title_style))
    story.append(Paragraph(f"Rapport d'analyse — {datetime.now().strftime('%d/%m/%Y')}", styles['Normal']))
    story.append(Spacer(1, 0.3 * inch))

    # Tracks
    for track in tracks:
        a = getattr(track, "analysis", None)  # TrackAnalysis or None
        story.append(Paragraph(f"{track.title} — {track.artist}", heading_style))

        # Track info table
        track_data = [
            ['BPM', str(getattr(a, 'bpm', 'N/A') if a else 'N/A')],
            ['Tonalité', str(getattr(a, 'key', 'N/A') if a else 'N/A')],
            ['Énergie', f"{getattr(a, 'energy', 0) if a else 0}%"],
            ['Genre', str(track.genre or 'N/A')],
            ['Durée', f"{int((track.duration or 0) / 60)}:{int((track.duration or 0) % 60):02d}"],
        ]
        if track.album:
            track_data.insert(0, ['Album', track.album])

        track_table = Table(track_data, colWidths=[1.5 * inch, 3.5 * inch])
        track_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#1e1b4b')),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#334155')),
        ]))
        story.append(track_table)

        # Cue points — CuePoint uses position_ms (int ms) and cue_type (str)
        if track.cue_points:
            story.append(Spacer(1, 0.15 * inch))
            story.append(Paragraph("Cue Points", styles['Heading3']))
            cue_data = [['Position', 'Type', 'Nom']]
            for cp in track.cue_points:
                pos_sec_total = (cp.position_ms or 0) / 1000.0
                pos_min = int(pos_sec_total / 60)
                pos_sec = int(pos_sec_total % 60)
                cue_data.append([
                    f"{pos_min}:{pos_sec:02d}",
                    str(cp.cue_type or 'Marker'),
                    str(cp.name or ''),
                ])
            cue_table = Table(cue_data, colWidths=[1 * inch, 1.5 * inch, 2.5 * inch])
            cue_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#6366f1')),
                ('TEXTCOLOR', (0, 0), (-1, -1), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#334155')),
            ]))
            story.append(cue_table)

        story.append(Spacer(1, 0.3 * inch))

    # Build PDF
    doc.build(story)
    pdf_buffer.seek(0)
    return pdf_buffer


def create_pdf_fpdf(tracks: list[Track]) -> io.BytesIO:
    """Create PDF using fpdf2 as fallback."""
    if not HAS_FPDF:
        raise HTTPException(status_code=500, detail="PDF library not available")

    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 20)
    pdf.set_text_color(168, 85, 247)  # Purple
    pdf.cell(0, 10, "TrackCue", ln=True)
    pdf.set_text_color(0, 0, 0)
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 5, f"Rapport d'analyse — {datetime.now().strftime('%d/%m/%Y')}", ln=True)
    pdf.ln(5)

    for track in tracks:
        a = getattr(track, "analysis", None)  # TrackAnalysis or None
        pdf.set_font("Helvetica", "B", 12)
        pdf.set_text_color(168, 85, 247)
        pdf.cell(0, 8, f"{track.title} — {track.artist}", ln=True)

        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(0, 0, 0)
        if track.album:
            pdf.cell(0, 4, f"Album: {track.album}", ln=True)
        pdf.cell(0, 4, f"BPM: {getattr(a, 'bpm', 'N/A') if a else 'N/A'}", ln=True)
        pdf.cell(0, 4, f"Tonalité: {getattr(a, 'key', 'N/A') if a else 'N/A'}", ln=True)
        pdf.cell(0, 4, f"Énergie: {getattr(a, 'energy', 0) if a else 0}%", ln=True)
        pdf.cell(0, 4, f"Genre: {track.genre or 'N/A'}", ln=True)
        pdf.cell(0, 4, f"Durée: {int((track.duration or 0) / 60)}:{int((track.duration or 0) % 60):02d}", ln=True)

        if track.cue_points:
            pdf.ln(3)
            pdf.set_font("Helvetica", "B", 10)
            pdf.cell(0, 5, "Cue Points:", ln=True)
            pdf.set_font("Helvetica", "", 8)
            for cp in track.cue_points:
                pos_sec_total = (cp.position_ms or 0) / 1000.0
                pos_min = int(pos_sec_total / 60)
                pos_sec = int(pos_sec_total % 60)
                pdf.cell(0, 3, f"  {pos_min}:{pos_sec:02d} — {cp.cue_type or 'Marker'} ({cp.name or ''})", ln=True)

        pdf.ln(8)

    pdf_bytes = io.BytesIO(pdf.output())
    pdf_bytes.seek(0)
    return pdf_bytes


@router.get("/pdf/{track_id}")
async def export_track_pdf(
    track_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    Export a single track analysis as PDF.
    GET /api/v1/export/pdf/{track_id}
    """
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == current_user.id
    ).first()

    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    # Generate PDF
    if HAS_REPORTLAB:
        pdf_buffer = create_pdf_reportlab([track])
    elif HAS_FPDF:
        pdf_buffer = create_pdf_fpdf([track])
    else:
        raise HTTPException(status_code=500, detail="PDF libraries not available")

    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={track.title}.pdf"}
    )


@router.get("/pdf/playlist/{playlist_id}")
async def export_playlist_pdf(
    playlist_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    Export all tracks in a playlist as PDF (max 200 tracks).
    GET /api/v1/export/pdf/playlist/{playlist_id}
    """
    playlist = db.query(Playlist).filter(
        Playlist.id == playlist_id,
        Playlist.user_id == current_user.id
    ).first()

    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    # Get all tracks in playlist
    tracks = db.query(Track).filter(
        Track.playlists.any(Playlist.id == playlist_id)
    ).all()

    # Enforce 200-track limit for export
    if len(tracks) > 200:
        raise HTTPException(status_code=400, detail="Playlist exceeds 200-track export limit")

    # Generate PDF
    if HAS_REPORTLAB:
        pdf_buffer = create_pdf_reportlab(tracks)
    elif HAS_FPDF:
        pdf_buffer = create_pdf_fpdf(tracks)
    else:
        raise HTTPException(status_code=500, detail="PDF libraries not available")

    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={playlist.name}.pdf"}
    )
