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
import { htmlIdGenerator } from '../../../services';
import { jsx as ___EmotionJSX } from "@emotion/react";
var EuiIconCrossInCircle = function EuiIconCrossInCircle(_ref) {
  var title = _ref.title,
    titleId = _ref.titleId,
    props = _objectWithoutProperties(_ref, _excluded);
  var generateId = htmlIdGenerator('crossInCircle');
  return ___EmotionJSX("svg", _extends({
    xmlns: "http://www.w3.org/2000/svg",
    width: 16,
    height: 16,
    fill: "none",
    viewBox: "0 0 16 16",
    "aria-labelledby": titleId
  }, props), title ? ___EmotionJSX("title", {
    id: titleId
  }, title) : null, ___EmotionJSX("g", {
    clipPath: "url(#".concat(generateId('a'), ")")
  }, ___EmotionJSX("path", {
    d: "m8.755 8 2.64 2.641a.534.534 0 1 1-.754.755L8 8.755l-2.641 2.64a.534.534 0 1 1-.755-.754L7.245 8l-2.64-2.641a.534.534 0 1 1 .754-.755L8 7.245l2.641-2.64a.534.534 0 1 1 .755.754L8.755 8Zm4.904-5.66c3.121 3.121 3.121 8.199 0 11.32-3.12 3.12-8.198 3.12-11.318 0C-.78 10.538-.78 5.46 2.34 2.34c3.12-3.12 8.198-3.12 11.319 0Zm-.665.666a7.062 7.062 0 1 0-9.988 9.988 7.062 7.062 0 0 0 9.988-9.988Z",
    clipRule: "evenodd"
  })), ___EmotionJSX("defs", null, ___EmotionJSX("clipPath", {
    id: generateId('a')
  }, ___EmotionJSX("path", {
    fill: "#fff",
    d: "M0 0h16v16H0z"
  }))));
};
export var icon = EuiIconCrossInCircle;