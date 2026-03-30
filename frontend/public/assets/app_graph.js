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
var EuiIconAppGraph = function EuiIconAppGraph(_ref) {
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
  }, title) : null, ___EmotionJSX("path", {
    d: "M24 20a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-6a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-8.2-5.62A4 4 0 1 1 18 1.06a4 4 0 0 1-2.2 7.32zm0-6a2 2 0 1 0 .01 0h-.01zm.01 29.24a4 4 0 1 1-.083-8 4 4 0 0 1 .083 8zm0-6a2 2 0 1 0 .39 0 2 2 0 0 0-.4 0h.01z",
    className: "euiIcon__fillSecondary"
  }), ___EmotionJSX("path", {
    d: "M18 17v-2h-6.14a4 4 0 0 0-.86-1.64l2.31-3.44-1.68-1.12-2.31 3.44A4 4 0 0 0 8 12a4 4 0 1 0 0 8 4 4 0 0 0 1.32-.24l2.31 3.44 1.66-1.12L11 18.64a4 4 0 0 0 .86-1.64H18ZM6 16a2 2 0 1 1 4 0 2 2 0 0 1-4 0Z"
  }));
};
export var icon = EuiIconAppGraph;