"""
Artwork Service: Color extraction, style classification,
background color optimization, and CDN optimization.

Points 921-930: Handle artwork imagery for the player UI.
"""

import logging
from typing import Optional, Dict, List, Tuple, Any
from dataclasses import dataclass
import math

logger = logging.getLogger(__name__)


@dataclass
class Color:
    """RGB color representation."""
    r: int
    g: int
    b: int

    def to_hex(self) -> str:
        """Convert to hex string."""
        return f"#{self.r:02x}{self.g:02x}{self.b:02x}"

    def to_rgb(self) -> str:
        """Convert to rgb() string."""
        return f"rgb({self.r}, {self.g}, {self.b})"

    def luminance(self) -> float:
        """Calculate perceived luminance (0-1)."""
        # sRGB luminance calculation
        r = self.r / 255.0
        g = self.g / 255.0
        b = self.b / 255.0

        r = r / 12.92 if r <= 0.03928 else ((r + 0.055) / 1.055) ** 2.4
        g = g / 12.92 if g <= 0.03928 else ((g + 0.055) / 1.055) ** 2.4
        b = b / 12.92 if b <= 0.03928 else ((b + 0.055) / 1.055) ** 2.4

        return 0.2126 * r + 0.7152 * g + 0.0722 * b

    def distance_to(self, other: 'Color') -> float:
        """Euclidean distance in RGB space."""
        return math.sqrt(
            (self.r - other.r) ** 2 +
            (self.g - other.g) ** 2 +
            (self.b - other.b) ** 2
        )

    def is_dark(self, threshold: float = 0.5) -> bool:
        """Check if color is dark."""
        return self.luminance() < threshold

    def is_light(self, threshold: float = 0.5) -> bool:
        """Check if color is light."""
        return self.luminance() >= threshold


@dataclass
class ColorPalette:
    """Color palette extracted from artwork."""
    primary: Color
    secondary: Color
    tertiary: Color
    accent: Color
    dominant_colors: List[Color]
    background_suggestion: Color


class ArtworkColorExtractor:
    """Extract dominant color palette from artwork."""

    @staticmethod
    def extract_palette(image_data: bytes,
                       palette_size: int = 4) -> ColorPalette:
        """
        Extract dominant color palette from image.

        Returns: ColorPalette with primary, secondary, tertiary, accent colors
        and background suggestion.

        Note: This is a simplified implementation using histogram analysis.
        In production, use PIL/Pillow for actual image processing.
        """
        # Simulated color analysis (in production, analyze actual image pixels)
        colors = ArtworkColorExtractor._analyze_image_histogram(image_data, palette_size)

        if len(colors) >= 4:
            return ColorPalette(
                primary=colors[0],
                secondary=colors[1],
                tertiary=colors[2],
                accent=colors[3],
                dominant_colors=colors,
                background_suggestion=ArtworkColorExtractor._suggest_background(colors[0])
            )
        else:
            # Fallback to neutral palette
            return ColorPalette(
                primary=Color(100, 100, 100),
                secondary=Color(150, 150, 150),
                tertiary=Color(200, 200, 200),
                accent=Color(50, 150, 255),
                dominant_colors=colors,
                background_suggestion=Color(240, 240, 240)
            )

    @staticmethod
    def _analyze_image_histogram(image_data: bytes,
                                palette_size: int) -> List[Color]:
        """
        Analyze image histogram (simplified).

        In production, use PIL/Pillow:
        from PIL import Image
        from colorsys import rgb_to_hsv

        img = Image.open(BytesIO(image_data))
        img = img.convert('RGB')
        # Extract pixels, cluster by color, return top N colors
        """
        # Mock implementation: return sample palette
        sample_palettes = [
            [Color(220, 50, 80), Color(100, 150, 200), Color(50, 100, 150), Color(240, 180, 50)],
            [Color(30, 50, 120), Color(100, 100, 100), Color(200, 200, 200), Color(255, 200, 100)],
            [Color(150, 50, 80), Color(200, 100, 50), Color(100, 50, 100), Color(50, 100, 150)],
        ]

        # Return first palette (in reality, analyze actual image)
        return sample_palettes[0][:palette_size]

    @staticmethod
    def _suggest_background(primary_color: Color) -> Color:
        """
        Suggest background color based on primary artwork color.

        If primary is dark, suggest light background.
        If primary is light, suggest dark background.
        """
        if primary_color.is_dark():
            # Light background
            # Add some color tint to primary color
            return Color(
                min(255, primary_color.r + 150),
                min(255, primary_color.g + 150),
                min(255, primary_color.b + 150)
            )
        else:
            # Dark background
            return Color(
                max(0, primary_color.r - 100),
                max(0, primary_color.g - 100),
                max(0, primary_color.b - 100)
            )


class ArtworkStyleClassifier:
    """Classify artwork style: minimalist, photo, abstract."""

    @staticmethod
    def classify(image_data: bytes) -> Dict[str, Any]:
        """
        Classify artwork style.

        Returns: {
            "style": "minimalist" | "photo" | "abstract" | "mixed",
            "confidence": 0.0-1.0,
            "characteristics": {
                "has_text": bool,
                "color_count": int,
                "complexity": float,
                "saturation": float,
            }
        }
        """
        # Simulated classification (in production, use actual image analysis)
        characteristics = ArtworkStyleClassifier._analyze_image(image_data)

        style = "abstract"
        confidence = 0.6

        # Decision logic
        if characteristics["color_count"] < 5 and characteristics["complexity"] < 0.3:
            style = "minimalist"
            confidence = 0.85
        elif characteristics["complexity"] > 0.7 and characteristics["saturation"] < 0.4:
            style = "photo"
            confidence = 0.8
        elif characteristics["saturation"] > 0.6 and characteristics["complexity"] > 0.4:
            style = "abstract"
            confidence = 0.75
        else:
            style = "mixed"
            confidence = 0.6

        return {
            "style": style,
            "confidence": confidence,
            "characteristics": characteristics
        }

    @staticmethod
    def _analyze_image(image_data: bytes) -> Dict[str, Any]:
        """
        Analyze image characteristics.

        In production, use PIL/numpy to analyze:
        - Color count (K-means clustering)
        - Complexity (edge detection, entropy)
        - Saturation (HSV conversion and analysis)
        - Text presence (OCR)
        """
        return {
            "has_text": False,
            "color_count": 8,
            "complexity": 0.5,
            "saturation": 0.6,
        }


class ArtworkBackgroundColorOptimizer:
    """Optimize artwork display with appropriate background color."""

    @staticmethod
    def get_optimal_background(primary_color: Color,
                              design_context: str = "player") -> Dict[str, str]:
        """
        Get optimal background color for context.

        Contexts:
        - player: Music player UI background
        - queue: Queue list background
        - waveform: Waveform visualization background
        - text_overlay: Background for overlaid text
        """
        # Determine if we need light or dark text on this background
        luminance = primary_color.luminance()

        results = {}

        if design_context == "player":
            # For player, use a slightly lighter/darker version of primary
            if luminance > 0.5:
                # Light primary: use darker background
                bg_color = Color(
                    max(0, primary_color.r - 80),
                    max(0, primary_color.g - 80),
                    max(0, primary_color.b - 80)
                )
            else:
                # Dark primary: use lighter background
                bg_color = Color(
                    min(255, primary_color.r + 80),
                    min(255, primary_color.g + 80),
                    min(255, primary_color.b + 80)
                )

            text_color = "white" if bg_color.luminance() < 0.5 else "black"
            results["background"] = bg_color.to_hex()
            results["text_color"] = text_color

        elif design_context == "queue":
            # Subtle background for queue list
            bg_color = Color(
                int(primary_color.r * 0.95 + 240 * 0.05),
                int(primary_color.g * 0.95 + 240 * 0.05),
                int(primary_color.b * 0.95 + 240 * 0.05)
            )
            results["background"] = bg_color.to_hex()
            results["text_color"] = "black"

        elif design_context == "waveform":
            # Transparent or semi-transparent background for waveform
            bg_color = Color(
                int(primary_color.r * 0.7 + 100 * 0.3),
                int(primary_color.g * 0.7 + 100 * 0.3),
                int(primary_color.b * 0.7 + 100 * 0.3)
            )
            results["background"] = bg_color.to_hex()
            results["opacity"] = 0.7

        elif design_context == "text_overlay":
            # Ensure good contrast for text overlay
            if luminance > 0.5:
                results["background"] = "rgba(0, 0, 0, 0.5)"
                results["text_color"] = "white"
            else:
                results["background"] = "rgba(255, 255, 255, 0.5)"
                results["text_color"] = "black"

        else:
            # Default
            results["background"] = primary_color.to_hex()
            results["text_color"] = "white" if luminance < 0.5 else "black"

        return results


class ArtworkCDNOptimizer:
    """Suggest CDN optimizations for artwork images."""

    @staticmethod
    def get_optimization_suggestions(image_url: str,
                                    image_format: str = "jpg",
                                    width: int = 500,
                                    height: int = 500) -> Dict[str, Any]:
        """
        Suggest CDN optimizations: format conversion, sizing, quality.

        Returns: {
            "format_suggestions": ["webp", "avif"],
            "sizing": {"desktop": "500x500", "mobile": "250x250", "thumbnail": "100x100"},
            "quality_recommendations": {
                "webp": {"quality": 80},
                "avif": {"quality": 75},
                "jpg": {"quality": 85}
            },
            "cdn_urls": {
                "webp_desktop": "...",
                "webp_mobile": "...",
                "jpg_original": "..."
            }
        }
        """
        suggestions = {
            "format_suggestions": ["webp", "avif"],
            "sizing": {
                "desktop": f"{width}x{height}",
                "mobile": f"{width // 2}x{height // 2}",
                "thumbnail": f"{width // 5}x{height // 5}"
            },
            "quality_recommendations": {
                "webp": {"quality": 80},
                "avif": {"quality": 75},
                "jpg": {"quality": 85}
            },
            "cdn_urls": ArtworkCDNOptimizer._build_cdn_urls(
                image_url, width, height
            )
        }

        return suggestions

    @staticmethod
    def _build_cdn_urls(base_url: str, width: int, height: int) -> Dict[str, str]:
        """
        Build CDN URLs for different formats and sizes.

        Example CDN provider: Cloudinary, imgix, etc.

        In production, integrate with actual CDN:
        - Cloudinary: https://res.cloudinary.com/demo/image/fetch/w_500,c_limit,f_webp/...
        - imgix: https://demo.imgix.net/image.jpg?w=500&auto=format
        """
        # Simplified: assume format parameters
        cdn_template = "{url}?w={w}&h={h}&q={q}&f={f}"

        return {
            "webp_desktop": cdn_template.format(
                url=base_url, w=width, h=height, q=80, f="webp"
            ),
            "webp_mobile": cdn_template.format(
                url=base_url, w=width//2, h=height//2, q=75, f="webp"
            ),
            "avif_desktop": cdn_template.format(
                url=base_url, w=width, h=height, q=75, f="avif"
            ),
            "jpg_original": cdn_template.format(
                url=base_url, w=width, h=height, q=85, f="jpg"
            ),
        }


class ArtworkBlurHashGenerator:
    """Generate blurhash for progressive image loading."""

    @staticmethod
    def generate(image_data: bytes) -> str:
        """
        Generate blurhash string for progressive loading.

        Blurhash is a compact string representation of a placeholder.
        Implemented by https://blurhash.com/

        In production, use blurhash library:
        from blurhash import encode

        hash_string = encode(image_array, x_components=4, y_components=3)
        """
        # Simulated blurhash (actual implementation uses blurhash library)
        # Returns string like "LHZc?wD+DIfQ^+D+D+D+D+"
        import hashlib
        hash_obj = hashlib.md5(image_data)
        return f"L{hash_obj.hexdigest()[:20]}"


class ArtworkService:
    """Main artwork service: orchestrate all artwork processing."""

    @staticmethod
    def process_artwork(image_url: str,
                       image_data: bytes = None) -> Dict[str, Any]:
        """
        Process artwork: extract colors, classify style, optimize for display.

        Returns: {
            "url": image_url,
            "palette": ColorPalette,
            "style": style classification,
            "background_color": optimized background,
            "cdn_suggestions": CDN optimizations,
            "blurhash": blurhash string
        }
        """
        if not image_data:
            # In production, fetch from URL
            logger.warning(f"No image data provided for {image_url}")
            return ArtworkService._get_default_artwork_metadata()

        palette = ArtworkColorExtractor.extract_palette(image_data)
        style = ArtworkStyleClassifier.classify(image_data)
        background = ArtworkBackgroundColorOptimizer.get_optimal_background(
            palette.primary, "player"
        )
        cdn_suggestions = ArtworkCDNOptimizer.get_optimization_suggestions(image_url)
        blurhash = ArtworkBlurHashGenerator.generate(image_data)

        return {
            "url": image_url,
            "palette": {
                "primary": palette.primary.to_hex(),
                "secondary": palette.secondary.to_hex(),
                "tertiary": palette.tertiary.to_hex(),
                "accent": palette.accent.to_hex(),
                "dominant_colors": [c.to_hex() for c in palette.dominant_colors],
                "background_suggestion": palette.background_suggestion.to_hex(),
            },
            "style": style,
            "background_color": background["background"],
            "text_color": background.get("text_color", "white"),
            "cdn_suggestions": cdn_suggestions,
            "blurhash": blurhash,
        }

    @staticmethod
    def _get_default_artwork_metadata() -> Dict[str, Any]:
        """Get default metadata for missing artwork."""
        return {
            "url": None,
            "palette": {
                "primary": "#808080",
                "secondary": "#A0A0A0",
                "tertiary": "#C0C0C0",
                "accent": "#3296FA",
                "dominant_colors": ["#808080", "#A0A0A0"],
                "background_suggestion": "#F0F0F0",
            },
            "style": {"style": "unknown", "confidence": 0.0, "characteristics": {}},
            "background_color": "#F0F0F0",
            "text_color": "black",
            "cdn_suggestions": {},
            "blurhash": None,
        }
