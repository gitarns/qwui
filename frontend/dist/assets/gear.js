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
var EuiIconGear = function EuiIconGear(_ref) {
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
    fillRule: "evenodd",
    d: "M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM6 8a2 2 0 1 1 4 0 2 2 0 0 1-4 0Z",
    clipRule: "evenodd"
  }), ___EmotionJSX("path", {
    fillRule: "evenodd",
    d: "M7 0a1 1 0 0 0-1 1v.799a1.58 1.58 0 0 1-2.37 1.369l-.692-.4a1 1 0 0 0-1.366.366l-1 1.732a1 1 0 0 0 .366 1.366l.692.4a1.58 1.58 0 0 1 0 2.737l-.692.4a1 1 0 0 0-.366 1.365l1 1.732a1 1 0 0 0 1.366.366l.692-.4A1.58 1.58 0 0 1 6 14.203V15a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-.799a1.58 1.58 0 0 1 2.37-1.368l.692.4a1 1 0 0 0 1.366-.367l1-1.732a1 1 0 0 0-.366-1.366l-.692-.4a1.58 1.58 0 0 1 0-2.736l.692-.4a1 1 0 0 0 .366-1.366l-1-1.732a1 1 0 0 0-1.366-.366l-.692.4A1.58 1.58 0 0 1 10 1.799V1a1 1 0 0 0-1-1H7Zm0 1.799V1h2v.8a2.58 2.58 0 0 0 3.87 2.234l.692-.4 1 1.732-.692.4a2.58 2.58 0 0 0 0 4.469l.692.4-1 1.731-.692-.4A2.58 2.58 0 0 0 9 14.202V15H7v-.799a2.58 2.58 0 0 0-3.87-2.234l-.692.4-1-1.733.692-.4a2.58 2.58 0 0 0 0-4.468l-.692-.4 1-1.732.692.4A2.58 2.58 0 0 0 7 1.799Z",
    clipRule: "evenodd"
  }));
};
export var icon = EuiIconGear;