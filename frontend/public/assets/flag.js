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
var EuiIconFlag = function EuiIconFlag(_ref) {
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
    d: "M2 1h1v1.27c.918-.27 2.658-.516 5.147.252 1.726.533 3.025.527 3.877.4.427-.064.744-.16.949-.235a2.685 2.685 0 0 0 .271-.116l.007-.004L14 2.13v7.157l-.249.145L13.5 9l.251.433-.002.001-.003.002-.009.005a1.372 1.372 0 0 1-.111.056c-.072.035-.175.08-.307.128a5.83 5.83 0 0 1-1.147.285c-1 .15-2.451.144-4.32-.432-1.725-.533-3.024-.527-3.876-.4A4.818 4.818 0 0 0 3 9.325V15H2V1Zm1 7.27a6.21 6.21 0 0 1 .828-.18c1-.15 2.451-.144 4.32.432 1.725.533 3.024.527 3.876.4.427-.064.744-.16.949-.235l.027-.01V3.73a6.21 6.21 0 0 1-.828.18c-1 .15-2.451.144-4.32-.432-2.611-.806-4.256-.38-4.852-.154V8.27Z",
    clipRule: "evenodd"
  }));
};
export var icon = EuiIconFlag;