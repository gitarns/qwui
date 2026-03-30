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
var EuiIconLogoMetrics = function EuiIconLogoMetrics(_ref) {
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
    fill: "none",
    fillRule: "evenodd"
  }, ___EmotionJSX("path", {
    fill: "#F04E98",
    d: "M2 32h28V20l-6.465-6.465a5 5 0 0 0-7.07 0L2 28v4Z"
  }), ___EmotionJSX("path", {
    d: "m16.465 13.535-3.536 3.536a9.965 9.965 0 0 0 7.07 2.93 9.965 9.965 0 0 0 7.072-2.93l-3.536-3.536a5 5 0 0 0-7.07 0",
    className: "euiIcon__fillNegative"
  }), ___EmotionJSX("path", {
    fill: "#FEC514",
    d: "M14.343 11.414A7.951 7.951 0 0 1 20 9.071c2.137 0 4.146.832 5.657 2.343l3.207 3.207A9.955 9.955 0 0 0 30 10.001c0-5.524-4.477-10-10-10-5.522 0-10 4.476-10 10 0 1.667.414 3.237 1.137 4.62l3.206-3.207Z"
  })));
};
export var icon = EuiIconLogoMetrics;