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
var EuiIconLogoSlack = function EuiIconLogoSlack(_ref) {
  var title = _ref.title,
    titleId = _ref.titleId,
    props = _objectWithoutProperties(_ref, _excluded);
  return ___EmotionJSX("svg", _extends({
    xmlns: "http://www.w3.org/2000/svg",
    width: 32,
    height: 32,
    viewBox: "0 0 32 32",
    "aria-labelledby": titleId
  }, props), title ? ___EmotionJSX("title", {
    id: titleId
  }, title) : null, ___EmotionJSX("g", {
    fill: "none"
  }, ___EmotionJSX("path", {
    fill: "#E01E5A",
    d: "M6.813 20.18a3.337 3.337 0 0 1-3.33 3.33 3.337 3.337 0 0 1-3.328-3.33 3.337 3.337 0 0 1 3.329-3.329h3.329v3.33zm1.677 0a3.337 3.337 0 0 1 3.33-3.329 3.337 3.337 0 0 1 3.328 3.33v8.335a3.337 3.337 0 0 1-3.329 3.329 3.337 3.337 0 0 1-3.329-3.33V20.18z"
  }), ___EmotionJSX("path", {
    fill: "#36C5F0",
    d: "M11.82 6.813a3.337 3.337 0 0 1-3.33-3.33A3.337 3.337 0 0 1 11.82.156a3.337 3.337 0 0 1 3.328 3.329v3.329H11.82zm0 1.677a3.337 3.337 0 0 1 3.328 3.33 3.337 3.337 0 0 1-3.329 3.328H3.484a3.337 3.337 0 0 1-3.33-3.329 3.337 3.337 0 0 1 3.33-3.329h8.335z"
  }), ___EmotionJSX("path", {
    fill: "#2EB67D",
    d: "M25.187 11.82a3.337 3.337 0 0 1 3.329-3.33 3.337 3.337 0 0 1 3.329 3.33 3.337 3.337 0 0 1-3.33 3.328h-3.328V11.82zm-1.678 0a3.337 3.337 0 0 1-3.329 3.328 3.337 3.337 0 0 1-3.329-3.329V3.484a3.337 3.337 0 0 1 3.33-3.33 3.337 3.337 0 0 1 3.328 3.33v8.335z"
  }), ___EmotionJSX("path", {
    fill: "#ECB22E",
    d: "M20.18 25.187a3.337 3.337 0 0 1 3.33 3.329 3.337 3.337 0 0 1-3.33 3.329 3.337 3.337 0 0 1-3.329-3.33v-3.328h3.33zm0-1.678a3.337 3.337 0 0 1-3.329-3.329 3.337 3.337 0 0 1 3.33-3.329h8.335a3.337 3.337 0 0 1 3.329 3.33 3.337 3.337 0 0 1-3.33 3.328H20.18z"
  })));
};
export var icon = EuiIconLogoSlack;