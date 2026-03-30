var _excluded = ["title", "titleId"];
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function _objectWithoutProperties(e, t) { if (null == e) return {}; var o, r, i = _objectWithoutPropertiesLoose(e, t); if (Object.getOwnPropertySymbols) { var n = Object.getOwnPropertySymbols(e); for (r = 0; r < n.length; r++) o = n[r], t.indexOf(o) >= 0 || {}.propertyIsEnumerable.call(e, o) && (i[o] = e[o]); } return i; }
function _objectWithoutPropertiesLoose(r, e) { if (null == r) return {}; var t = {}; for (var n in r) if ({}.hasOwnProperty.call(r, n)) { if (e.indexOf(n) >= 0) continue; t[n] = r[n]; } return t; }
/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

// THIS IS A GENERATED FILE. DO NOT MODIFY MANUALLY. @see scripts/compile-icons.js

import * as React from 'react';
import { jsx as ___EmotionJSX } from "@emotion/react";
var EuiIconAnomalyChart = function EuiIconAnomalyChart(_ref) {
  var title = _ref.title,
    titleId = _ref.titleId,
    props = _objectWithoutProperties(_ref, _excluded);
  return ___EmotionJSX("svg", _extends({
    xmlns: "http://www.w3.org/2000/svg",
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    "aria-labelledby": titleId
  }, props), title ? ___EmotionJSX("title", {
    id: titleId
  }, title) : null, ___EmotionJSX("path", {
    d: "M14.5 14H2V1.5a.5.5 0 0 0-1 0v13a.5.5 0 0 0 .5.5h13a.5.5 0 0 0 0-1Z"
  }), ___EmotionJSX("path", {
    d: "M8.42 5a.5.5 0 0 1 .505.43L9.864 12h.873l.957-.87a.5.5 0 0 1 .672 0l1.1 1a.5.5 0 0 1-.672.74l-.764-.694-.764.694a.5.5 0 0 1-.336.13h-1.5a.5.5 0 0 1-.495-.43l-.429-3-.312 2.982a.5.5 0 0 1-.834.318l-.689-.626-.404.552a.5.5 0 0 1-.404.204h-.53a.5.5 0 0 1-.403-.204l-.405-.552-.689.626a.5.5 0 1 1-.672-.74l1.1-1a.5.5 0 0 1 .74.074l.583.796h.023l.583-.796a.5.5 0 0 1 .74-.074l.37.336.63-6.018A.5.5 0 0 1 8.42 5Zm.08-3.01a.5.5 0 1 0 0 1.002.5.5 0 0 0 0-1.002ZM8.5 4A1.503 1.503 0 0 1 7 2.493a1.5 1.5 0 0 1 .44-1.066c.566-.57 1.554-.57 2.121 0 .283.285.439.663.439 1.066A1.502 1.502 0 0 1 8.5 4Z"
  }));
};
export var icon = EuiIconAnomalyChart;