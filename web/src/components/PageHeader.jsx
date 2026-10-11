import React from 'react';

// Title and subtitle block rendered at the top of every page, below the white
// app bar. The bar itself (burger + white background) lives once in the Layout,
// not here, so this component just carries the page's heading text.
export default function PageHeader({ title, subtitle }) {
  return (
    <div className="page-head">
      <h2>{title}</h2>
      {subtitle ? <p className="sub">{subtitle}</p> : null}
    </div>
  );
}