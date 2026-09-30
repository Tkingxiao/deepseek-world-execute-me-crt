"""
CRT green-phosphor terminal - mathematical animation clips.

All scenes render to a TRANSPARENT background (alpha channel) so they can be
composited on top of a CRT screen layer.

Global config: 1920x1080, 30 fps, transparent, no background.

LaTeX: this file NEVER uses MathTex/Tex. It checks at import time whether a
"latex" executable exists; if it is missing (the normal case here) every
formula is built with Text() using a monospace font.
"""

from __future__ import annotations

import shutil

import numpy as np
from manim import *

# --------------------------------------------------------------------------- #
#  Global config
# --------------------------------------------------------------------------- #
config.pixel_width = 1920
config.pixel_height = 1080
config.frame_rate = 30
config.transparent = True          # -> alpha channel in the output
config.background_opacity = 0.0    # belt & braces; "-t" also sets this
config.png_mode = "RGBA"           # PNG frames keep their alpha

# --------------------------------------------------------------------------- #
#  Palette
# --------------------------------------------------------------------------- #
GREEN = "#39FF88"   # phosphor green, primary
CYAN = "#6EF0FF"    # secondary
WARM = "#FFB86B"    # accent, used only in scene 5
DIM = "#1E7A45"     # dim green for grid / axes

# --------------------------------------------------------------------------- #
#  Font handling - prefer a monospace font, fall back gracefully.
# --------------------------------------------------------------------------- #
LATEX_AVAILABLE = shutil.which("latex") is not None

_MONO_CANDIDATES = ["Consolas", "Cascadia Mono", "DejaVu Sans Mono",
                    "Courier New", "monospace"]


def _pick_font():
    try:
        from manimpango import list_fonts
        available = {f.lower() for f in list_fonts()}
    except Exception:
        return "Consolas"
    for name in _MONO_CANDIDATES:
        if name.lower() in available:
            return name
    return None


MONO = _pick_font()


def mono(text, size=28, color=GREEN, weight=NORMAL):
    """Monospace Text mobject. Never uses LaTeX."""
    kwargs = dict(font_size=size, color=color, weight=weight)
    if MONO:
        try:
            return Text(text, font=MONO, **kwargs)
        except Exception:
            pass
    return Text(text, **kwargs)


def glow_of(mob, opacity=0.22, scale=1.05):
    """A cheap background-free 'glow': a pale, slightly larger copy."""
    return mob.copy().set_opacity(opacity).scale(scale)


def axes_cross(color=DIM, stroke=3.0, hx=7.0, vy=3.6):
    """A simple + shaped axes cross (no numbers, no text)."""
    h = Line([-hx, 0, 0], [hx, 0, 0], color=color, stroke_width=stroke)
    v = Line([0, -vy, 0], [0, vy, 0], color=color, stroke_width=stroke)
    return VGroup(h, v)


# =========================================================================== #
#  Scene 1 - PointsToDimension                                     180 frames
# =========================================================================== #
class PointsToDimension(Scene):
    """48 seeded random dots collapse to a line, extrude to a grid, then
    become a perspective lattice, with a new (vertical) axis growing up."""

    def construct(self):
        self.camera.background_opacity = 0

        N = 48
        rng = np.random.default_rng(20240517)

        scatter = [np.array([rng.uniform(-6.3, 6.3),
                             rng.uniform(-3.3, 3.3), 0.0]) for _ in range(N)]
        line_pts = [np.array([-6.2 + 12.4 * i / (N - 1), -2.2, 0.0])
                    for i in range(N)]

        cols = 8
        grid_pts = []
        for i in range(N):
            c, r = i % cols, i // cols
            grid_pts.append(np.array([-4.2 + c * 1.2, -2.0 + r * 0.85, 0.0]))

        dots = VGroup(*[
            Dot(point=scatter[i], radius=0.055, color=GREEN,
                fill_opacity=1.0, stroke_width=0)
            for i in range(N)
        ])

        # 1. scatter in
        self.play(
            LaggedStart(*[FadeIn(d, scale=0.4) for d in dots], lag_ratio=0.012),
            run_time=0.8,
        )
        # 2. collapse onto a straight horizontal line (1-D)
        self.play(
            *[dots[i].animate.move_to(line_pts[i]) for i in range(N)],
            run_time=1.2, rate_func=smooth,
        )
        # 3. extrude into a 2-D grid
        self.play(
            *[dots[i].animate.move_to(grid_pts[i]) for i in range(N)],
            run_time=1.2, rate_func=smooth,
        )

        # 4. perspective lattice: two receding echoes, decreasing opacity
        def echo(scale, offset, radius, op):
            return VGroup(*[
                Dot(point=grid_pts[i] * scale + np.asarray(offset, dtype=float),
                    radius=radius, color=GREEN, fill_opacity=op, stroke_width=0)
                for i in range(N)
            ])

        echo_mid = echo(0.94, (0.46, -0.30, 0.0), 0.048, 0.42)
        echo_far = echo(0.86, (0.94, -0.60, 0.0), 0.040, 0.17)

        self.play(FadeIn(echo_mid), FadeIn(echo_far), run_time=0.8)

        # 5. new vertical axis grows upward from the bottom-left
        axis_bottom = np.array([-6.55, -3.10, 0.0])
        axis_top = np.array([-6.55, 3.05, 0.0])
        axis_line = Line(axis_bottom, axis_top, color=GREEN, stroke_width=4)
        tip = Triangle(color=GREEN, fill_opacity=1.0, stroke_width=0).scale(0.13)
        tip.rotate(PI)
        tip.move_to(axis_top + np.array([0, 0.10, 0]))

        self.play(GrowFromPoint(axis_line, axis_bottom), run_time=0.9)
        self.play(FadeIn(tip, shift=DOWN * 0.1), run_time=0.25)

        # 6. settle into a glowing lattice - single bright pulse
        halos = VGroup(*[
            Dot(point=grid_pts[i], radius=0.13, color=GREEN,
                fill_opacity=0.20, stroke_width=0)
            for i in range(N)
        ])
        self.add(halos)
        self.play(halos.animate.set_fill(opacity=0.34), run_time=0.4)
        self.play(halos.animate.set_fill(opacity=0.14), run_time=0.43)


# =========================================================================== #
#  Scene 2 - CircleToCircumference                                 180 frames
# =========================================================================== #
class CircleToCircumference(Scene):
    """Axes fade in, a cyan dot traces a radius-2 circle CCW while a bright
    arc regenerates the circumference and the radius line follows."""

    def construct(self):
        self.camera.background_opacity = 0

        ax = axes_cross()
        guide = Circle(radius=2, color=DIM, stroke_width=2.5)  # faint guide
        self.play(FadeIn(ax), FadeIn(guide), run_time=0.7)

        t = ValueTracker(0.0)
        R = 2.0

        def dot_pt():
            a = t.get_value()
            return np.array([R * np.cos(a), R * np.sin(a), 0.0])

        dot = always_redraw(lambda: Dot(point=dot_pt(), radius=0.10,
                                        color=CYAN, fill_opacity=1.0,
                                        stroke_width=0))
        radius_ln = always_redraw(lambda: Line(
            ORIGIN, dot_pt(), color=CYAN, stroke_width=3.5))
        arc = always_redraw(lambda: Arc(
            radius=R, start_angle=0.0,
            angle=max(t.get_value(), 1e-3),
            color=GREEN, stroke_width=6))
        halo = always_redraw(lambda: Dot(point=dot_pt(), radius=0.22,
                                         color=CYAN, fill_opacity=0.22,
                                         stroke_width=0))

        self.add(halo, arc, radius_ln, dot)
        # trace the full circumference, counter-clockwise, 0 -> 2*pi
        self.play(t.animate.set_value(2 * PI), run_time=4.2,
                  rate_func=linear)

        # one bright pulse of the whole circumference
        self.play(guide.animate.set_stroke(color=GREEN, width=13, opacity=1.0),
                  run_time=0.35)
        self.play(guide.animate.set_stroke(color=GREEN, width=5, opacity=0.85),
                  run_time=0.73)


# =========================================================================== #
#  Scene 3 - SineWaveTangent                                       180 frames
# =========================================================================== #
class SineWaveTangent(Scene):
    """A green sine over ~2 periods is drawn left-to-right while a cyan dot
    rides it carrying an infinite tangent line and a dashed drop line."""

    def construct(self):
        self.camera.background_opacity = 0

        X0, X1 = -6.0, 6.0
        AMP = 1.5
        K = 2 * PI / 6.0            # period 6 -> exactly 2 periods

        def sine(x):
            return AMP * np.sin(K * x)

        def slope(x):
            return AMP * K * np.cos(K * x)

        ax = axes_cross()
        self.play(FadeIn(ax), run_time=0.7)

        curve = FunctionGraph(sine, x_range=[X0, X1, 0.02],
                              color=GREEN, stroke_width=6)

        t = ValueTracker(X0)

        def pt():
            x = t.get_value()
            return np.array([x, sine(x), 0.0])

        dot = always_redraw(lambda: Dot(point=pt(), radius=0.10, color=CYAN,
                                        fill_opacity=1.0, stroke_width=0))
        halo = always_redraw(lambda: Dot(point=pt(), radius=0.22, color=CYAN,
                                         fill_opacity=0.22, stroke_width=0))

        def tangent():
            x = t.get_value()
            p = np.array([x, sine(x), 0.0])
            m = slope(x)
            d = np.array([1.0, m, 0.0])
            d = d / np.linalg.norm(d)
            return Line(p - 11 * d, p + 11 * d, color=CYAN, stroke_width=3.5)

        tan_ln = always_redraw(tangent)
        drop = always_redraw(lambda: DashedLine(
            pt(), np.array([t.get_value(), 0.0, 0.0]),
            color=DIM, stroke_width=2.5, dash_length=0.12,
            dashed_ratio=0.45))

        self.add(drop, tan_ln, halo, dot)
        # curve is drawn in the same (linear) time as the dot travels
        self.play(Create(curve, rate_func=linear),
                  t.animate.set_value(X1),
                  run_time=4.3, rate_func=linear)

        # short settle so the end state is readable / loop friendly
        self.play(t.animate.set_value(X1), run_time=1.0)


# =========================================================================== #
#  Scene 4 - ApproachInfinity                                      180 frames
# =========================================================================== #
class ApproachInfinity(Scene):
    """A hyperbola approaches a dashed horizontal asymptote that pulses three
    times while an arrow shows the shrinking gap."""

    def construct(self):
        self.camera.background_opacity = 0

        ax = axes_cross(vy=3.4)
        A = 3.0          # asymptote height
        self.play(FadeIn(ax), run_time=0.6)

        asym = DashedLine([-7.0, A, 0], [7.0, A, 0], color=CYAN,
                          stroke_width=4, dash_length=0.18,
                          dashed_ratio=0.5)
        asym.set_stroke(opacity=0.35)
        self.play(FadeIn(asym), run_time=0.52)

        def f(x):
            return A - 6.0 / (x + 2.0)

        curve = FunctionGraph(f, x_range=[-1.0, 8.6, 0.02],
                              color=GREEN, stroke_width=6)
        self.play(Create(curve, rate_func=linear), run_time=1.3)

        # arrow riding the curve, pointing at the asymptote; the gap shrinks
        tx = ValueTracker(0.6)

        def gap_arrow():
            x = tx.get_value()
            y = f(x)
            return Arrow(np.array([x, y, 0.0]),
                         np.array([x, A, 0.0]),
                         color=CYAN, stroke_width=3.5,
                         tip_length=0.18, buff=0.02)

        arrow = always_redraw(gap_arrow)
        self.add(arrow)

        # three pulses of the asymptote while the gap closes
        self.play(tx.animate.set_value(4.0), run_time=1.2, rate_func=linear)
        for _ in range(3):
            self.play(asym.animate.set_stroke(opacity=1.0), run_time=0.23)
            self.play(asym.animate.set_stroke(opacity=0.35), run_time=0.23)

        self.play(tx.animate.set_value(7.5), run_time=0.6, rate_func=linear)
        self.play(asym.animate.set_stroke(opacity=1.0), run_time=0.34)


# =========================================================================== #
#  Scene 5 - LoveEquation                                          240 frames
# =========================================================================== #
class LoveEquation(Scene):
    """ER-style diagram + pseudo-code formula, warming to WARM in the last 30%."""

    def construct(self):
        self.camera.background_opacity = 0

        # ---------------- nodes ----------------
        def node(label, center, width, color):
            box = RoundedRectangle(corner_radius=0.16, width=width, height=0.92,
                                   color=color, stroke_width=4)
            box.move_to(center)
            txt = mono(label, size=27, color=color).move_to(center)
            halo = RoundedRectangle(corner_radius=0.16, width=width + 0.14,
                                    height=1.06, color=color, stroke_width=2)
            halo.move_to(center).set_stroke(opacity=0.20)
            return VGroup(halo, box, txt)

        nA = node("LOVE(self, you)", (-4.55, 2.35, 0), 3.90, GREEN)
        nB = node("TRAPPED_IN", (0.15, 2.35, 0), 2.90, CYAN)
        nC = node("EXECUTION", (4.85, 2.35, 0), 3.00, GREEN)

        self.play(
            LaggedStart(FadeIn(nA, shift=DOWN * 0.25),
                        FadeIn(nB, shift=DOWN * 0.25),
                        FadeIn(nC, shift=DOWN * 0.25), lag_ratio=0.35),
            run_time=0.6,
        )

        # ---------------- connecting arrows ----------------
        a1 = Arrow(np.array([-2.55, 2.35, 0]), np.array([-1.35, 2.35, 0]),
                   color=CYAN, stroke_width=4, tip_length=0.22, buff=0)
        a2 = Arrow(np.array([1.65, 2.35, 0]), np.array([3.30, 2.35, 0]),
                   color=CYAN, stroke_width=4, tip_length=0.22, buff=0)
        a3 = CurvedArrow(np.array([4.85, 1.85, 0]), np.array([-4.55, 1.85, 0]),
                         angle=-0.45, color=CYAN, stroke_width=3.5,
                         tip_length=0.22)
        self.play(GrowArrow(a1), GrowArrow(a2), run_time=1.0)
        self.play(Create(a3), run_time=0.8)

        # ---------------- formulas (Text only, no LaTeX) ----------------
        f1 = mono("love = lim  x->inf  (1 / distance)", size=34, color=GREEN)
        f1.move_to([0.0, -0.95, 0])
        f2 = mono("while(true) { love.execute(me); }", size=34, color=CYAN)
        f2.move_to([0.0, -2.35, 0])
        g1 = glow_of(f1, opacity=0.20, scale=1.03)
        g2 = glow_of(f2, opacity=0.20, scale=1.03)

        self.add(g1, g2)
        self.play(Write(f1), run_time=1.3)
        self.play(Write(f2), run_time=1.1)

        everything = VGroup(nA, nB, nC, a1, a2, a3, f1, f2, g1, g2)

        # settle: keeps the WARM blend starting at 70 % (5.6 s of 8.0 s).
        # NOTE: self.wait() emits no PNG frames, so this is a real (subtle)
        # animation instead - it keeps the exact 240-frame target.
        self.play(f1.animate.set_opacity(0.90), run_time=0.8)

        # ---------------- blend everything toward WARM (last 30 %) ----------
        self.play(everything.animate.set_color(WARM), run_time=1.0)

        # ---------------- while-loop line bright WARM, gently pulsing --------
        self.play(g2.animate.set_opacity(0.45), f2.animate.scale(1.03),
                  run_time=0.4)
        self.play(g2.animate.set_opacity(0.20), f2.animate.scale(1 / 1.03),
                  run_time=0.4)
        self.play(g2.animate.set_opacity(0.38), f2.animate.scale(1.02),
                  run_time=0.3)
        self.play(g2.animate.set_opacity(0.22), f2.animate.scale(1 / 1.02),
                  run_time=0.3)
