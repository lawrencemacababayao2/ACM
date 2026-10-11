import React from 'react';

/**
 * BrandMotif — the "circuit tree" background illustration, shown once behind the
 * content of every authenticated admin page.
 *
 * The artwork is the supplied circuittreeBG.png, recoloured to the brand green
 * #126242 as circuittreeBG-brand.png — the original RGB was #035E03, which sat
 * off-palette against the admin's green. Only the colour bytes were changed; the
 * alpha channel is byte-identical to the source, so every edge is as smooth as
 * the original. It is a square RGBA image whose corners are already transparent,
 * so it sits over the page background without needing a mask or a background fill.
 *
 * The original circuittreeBG.png is kept in /public so the tint can be reverted.
 *
 * All placement lives in the .brand-motif rules in styles.css: fixed to the
 * bottom-right corner, cropped by the viewport edge, behind content (z-index: -1)
 * and never intercepting clicks. Sizing is driven by the image's own aspect
 * ratio, so only the width needs to be set.
 *
 * Decorative only, hence aria-hidden and an empty alt.
 */
export default function BrandMotif({ className = '' }) {
  return (
    <div className={`brand-motif ${className}`.trim()} aria-hidden="true">
      <img src="/circuittreeBG-brand.png" alt="" draggable="false" />
    </div>
  );
}