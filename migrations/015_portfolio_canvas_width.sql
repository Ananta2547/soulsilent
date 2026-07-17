-- Migration 015: portfolio canvas width (paper size support)
-- Width was previously hard-coded at 880px in the editor. Store it so different
-- paper sizes (A4, A3, Letter, Square, Story, ...) render consistently.

ALTER TABLE portfolios ADD COLUMN canvas_width INTEGER DEFAULT 880;
