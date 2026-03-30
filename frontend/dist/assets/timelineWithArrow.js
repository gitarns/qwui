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
var EuiIconTimelineWithArrow = function EuiIconTimelineWithArrow(_ref) {
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
    d: "M7.854 4.854A.5.5 0 0 1 7 4.5V4H6a1 1 0 0 1-1-1V1a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H8v.5a.5.5 0 0 1-.146.354ZM6 3V1h3v2H6ZM2.146 9.146A.5.5 0 0 0 2 9.5v.5H1a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3v-.5a.5.5 0 0 0-.854-.354ZM4 13v-2H1v2h3ZM11.5 15a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm.354-6.854 2 2a.5.5 0 0 1 0 .708l-2 2a.5.5 0 0 1-.707-.708L12.293 11H9.5a.5.5 0 0 1 0-1h2.793l-1.146-1.146a.5.5 0 1 1 .707-.708ZM8.337 6H3.915a1.5 1.5 0 0 0-2.83 0H.5a.5.5 0 0 0 0 1h.585a1.5 1.5 0 0 0 2.83 0h3.342c.314-.38.677-.716 1.08-1ZM2 6.5a.5.5 0 1 1 1 0 .5.5 0 0 1-1 0Z"
  }));
};
export var icon = EuiIconTimelineWithArrow;