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
var EuiIconTokenNested = function EuiIconTokenNested(_ref) {
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
  }, title) : null, ___EmotionJSX("g", {
    fillRule: "evenodd"
  }, ___EmotionJSX("path", {
    d: "M11 3c1.044 0 1.913.757 1.994 1.736l.006.149v6.23c0 1-.82 1.805-1.845 1.88L11 13H9.501a.5.5 0 0 1-.09-.992l.09-.008H11c.52 0 .937-.35.993-.783l.007-.102v-6.23c0-.445-.379-.827-.882-.879L11 4H9.5a.5.5 0 0 1-.09-.992L9.5 3H11ZM6.5 3a.5.5 0 0 1 .09.992L6.5 4H5c-.52 0-.937.35-.993.783L4 4.885v6.23c0 .445.379.827.882.879L5 12h1.5a.5.5 0 0 1 .09.992L6.5 13H5c-1.044 0-1.913-.757-1.994-1.736L3 11.115v-6.23c0-1 .82-1.805 1.845-1.88L5 3h1.5Z"
  }), ___EmotionJSX("path", {
    d: "M5.864 7.25a.714.714 0 1 1 0 1.429.714.714 0 0 1 0-1.429Zm2.143 0a.714.714 0 1 1 0 1.429.714.714 0 0 1 0-1.429Zm2.143 0a.714.714 0 1 1 0 1.429.714.714 0 0 1 0-1.429Z"
  })));
};
export var icon = EuiIconTokenNested;