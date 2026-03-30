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
var EuiIconSearch = function EuiIconSearch(_ref) {
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
    d: "M6.5 1a5.5 5.5 0 0 1 4.729 8.308l3.421 2.933a1 1 0 0 1 .057 1.466l-1 1a1 1 0 0 1-1.466-.057l-2.933-3.42A5.5 5.5 0 1 1 6.5 1Zm4.139 9.12a5.516 5.516 0 0 1-.52.519L13 14l1-1-3.361-2.88ZM6.5 2a4.5 4.5 0 1 0 .314 8.987c.024-.001.047-.004.07-.006.207-.017.41-.048.607-.092l.066-.016a4.41 4.41 0 0 0 .588-.185c.012-.006.026-.01.039-.015.194-.079.382-.171.562-.275l.03-.017a4.52 4.52 0 0 0 1.605-1.605c.006-.01.01-.02.017-.03.104-.18.196-.368.275-.562l.018-.048c.074-.188.134-.38.182-.58l.016-.065a4.49 4.49 0 0 0 .093-.61l.005-.067a4.544 4.544 0 0 0 .007-.545A4.5 4.5 0 0 0 6.5 2Z"
  }));
};
export var icon = EuiIconSearch;