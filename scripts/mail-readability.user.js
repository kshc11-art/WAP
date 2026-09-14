// ==UserScript==
// @name         KRISS 메일 가독성 개선 + 답장/전달 강조
// @namespace    kriss-mail- readable
// @version      1.0
// @description  KRISS 메일 폰트 확대 및 제목 앞 [답장]/[전달] 배지 강조
// @match        https://gw.kriss.re.kr/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==


(function () {

    'use strict';


    /* =========================================================
       기본 설정
       ========================================================= */

    const FONT_FAMILY =
        '"Malgun Gothic", "맑은 고딕", Arial, sans-serif';

    const UI_FONT_SIZE = '15px';
    const LIST_FONT_SIZE = '15px';
    const MAIL_FONT_SIZE = '17px';
    const MAIL_LINE_HEIGHT = '1.75';



    /* =========================================================
       CSS
       ========================================================= */

    const style = document.createElement('style');

    style.textContent = `

        /* 기본 폰트 */

        body,
        input,
        textarea,
        select,
        button {
            font-family:${FONT_FAMILY} !important;
        }

        body {
            font-size:${UI_FONT_SIZE} !important;
        }


        /* 좌측 편지함 */

        #folder_content,
        #folder_content a,
        #folder_content span,
        #folder_content div,
        #folder_content li {
            font-family:${FONT_FAMILY} !important;
            font-size:${UI_FONT_SIZE} !important;
        }

        #folder_list li > a,
        #etc_folder_list li > a,
        #oldMailDiv li > a {
            line-height:1.55 !important;
        }


        /* 메일 목록 */

        #list_content,
        #list_content * {
            font-family:${FONT_FAMILY} !important;
        }

        #list_content td,
        #list_content a,
        #list_content span,
        #list_content div {
            font-size:${LIST_FONT_SIZE} !important;
        }

        #list_content td {
            line-height:1.5 !important;
        }

        #list_content tbody td {
            padding-top:7px !important;
            padding-bottom:7px !important;
        }


        /* [답장] / [전달] 배지 */

        .tm-mail-badge {
            display:inline-flex !important;
            align-items:center !important;
            justify-content:center !important;

            padding:2px 6px !important;
            margin-right:5px !important;

            border-radius:4px !important;

            font-family:${FONT_FAMILY} !important;
            font-size:12px !important;
            font-weight:700 !important;

            line-height:1.4 !important;

            vertical-align:1px !important;

            white-space:nowrap !important;

            text-decoration:none !important;
        }

        .tm-mail-reply {
            color:#1764ad !important;
            background:#edf5ff !important;
            border:1px solid #bfd9f4 !important;
        }

        .tm-mail-forward {
            color:#a45a00 !important;
            background:#fff3e5 !important;
            border:1px solid #ebc794 !important;
        }

        #list_content a:hover .tm-mail-badge {
            text-decoration:none !important;
        }


        /* 메일 본문 */

        #normal_message_content {
            font-family:${FONT_FAMILY} !important;
        }

        #normal_message_content p,
        #normal_message_content div,
        #normal_message_content span,
        #normal_message_content li,
        #normal_message_content td,
        #normal_message_content th,
        #normal_message_content a {
            font-family:${FONT_FAMILY} !important;
            line-height:${MAIL_LINE_HEIGHT} !important;
        }

        #normal_message_content p,
        #normal_message_content li {
            font-size:${MAIL_FONT_SIZE} !important;
        }


        /* 보안메일 */

        #security_content,
        #security_content * {
            font-family:${FONT_FAMILY} !important;
        }


        /* 입력 필드 */

        input,
        textarea,
        select {
            font-size:15px !important;
        }


        /* 지운편지함 비우기
           아이콘/클릭영역은 유지하고 글자만 숨김 */

        .btn_trshbx_dl {
            font-size:0 !important;
            overflow:hidden !important;
            white-space:nowrap !important;
        }


        /* 이동 select 링크
           클릭 영역은 유지하고 글자만 숨김 */

        .slt_solo > a {
            font-size:0 !important;
        }

    `;

    document.head.appendChild(style);



    /* =========================================================
       [답장] / [전달] 배지
       ========================================================= */

    function scanMailBadges() {

        const list =
            document.getElementById('list_content');

        if (!list) {
            return;
        }


        const walker =
            document.createTreeWalker(
                list,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode: function (node) {

                        if (
                            !node.nodeValue ||
                            !node.nodeValue.trim()
                        ) {
                            return NodeFilter.FILTER_REJECT;
                        }

                        const parent =
                            node.parentElement;

                        if (!parent) {
                            return NodeFilter.FILTER_REJECT;
                        }

                        if (
                            parent.closest(
                                '.tm-mail-badge,' +
                                'script,' +
                                'style,' +
                                'select,' +
                                'option'
                            )
                        ) {
                            return NodeFilter.FILTER_REJECT;
                        }

                        return NodeFilter.FILTER_ACCEPT;
                    }
                }
            );


        const nodes = [];

        let node;

        while (
            (node = walker.nextNode())
        ) {
            nodes.push(node);
        }


        nodes.forEach(function (textNode) {
            processBadgeText(textNode);
        });

    }
function highlightDatesInSubject() {

    /*
     * =========================================================
     * 날짜 강조 스타일
     * =========================================================
     */

    if (!document.getElementById('tm-mail-date-style')) {

        const style =
            document.createElement('style');

        style.id =
            'tm-mail-date-style';

        style.textContent = `

            .tm-mail-date-badge {

                display:inline-flex !important;

                align-items:center !important;
                justify-content:center !important;

                padding:2px 6px !important;

                margin-left:3px !important;
                margin-right:3px !important;

                border-radius:4px !important;

                font-family:
                    "Malgun Gothic",
                    "맑은 고딕",
                    Arial,
                    sans-serif !important;

                font-size:12px !important;

                font-weight:700 !important;

                line-height:1.4 !important;

                color:#28734f !important;

                background:#edf8f2 !important;

                border:1px solid #bcdcc9 !important;

                white-space:nowrap !important;

                vertical-align:1px !important;

                text-decoration:none !important;
            }


            #list_content a:hover
            .tm-mail-date-badge {

                text-decoration:none !important;

            }

        `;

        document.head.appendChild(
            style
        );

    }



    /*
     * =========================================================
     * 메일 목록
     * =========================================================
     */

    const list =
        document.getElementById(
            'list_content'
        );


    if (!list) {
        return;
    }



    /*
     * =========================================================
     * 정규식 구성
     * =========================================================
     *
     * 날짜
     *
     * 2026.09.11
     * 2026-09-11
     * 2026/09/11
     *
     * 9/11
     * 9/30
     * 09/30
     *
     * 9.11
     * 9-11
     *
     * 9월 11일
     *
     *
     * 요일
     *
     * (월)
     * (화)
     * (수)
     * ...
     *
     *
     * 시간
     *
     * 15시
     * 15시30분
     * 15시 30분
     * 15:30
     *
     * 오전 10시
     * 오후 3시
     * 오후 3시 30분
     *
     * =========================================================
     */


    /*
     * 월
     *
     * 1 ~ 12
     */

    const MONTH =
        '(?:1[0-2]|0?[1-9])';


    /*
     * 일
     *
     * 중요:
     * 두 자리 날짜를 먼저 검사
     *
     * 30 → 먼저 매칭
     * 11 → 먼저 매칭
     * 1  → 마지막에 매칭
     */

    const DAY =
        '(?:3[01]|[12]\\d|0?[1-9])';



    /*
     * 연도
     */

    const YEAR =
        '(?:20\\d{2})';



    /*
     * 날짜 기본 형태
     */

    const DATE_CORE =

        '(?:' +

            /*
             * 2026/09/11
             * 2026-09-11
             * 2026.09.11
             */

            YEAR +
            '[.\\-/]' +
            MONTH +
            '[.\\-/]' +
            DAY +

        '|' +

            /*
             * 9/11
             * 09/30
             * 9.11
             * 9-30
             */

            MONTH +
            '[.\\-/]' +
            DAY +

        '|' +

            /*
             * 9월 11일
             */

            MONTH +
            '월\\s*' +
            DAY +
            '일' +

        ')';



    /*
     * 요일
     *
     * (월)
     * (화)
     * ...
     */

    const WEEKDAY =
        '(?:\\s*\\([월화수목금토일]\\))?';



    /*
     * 시간
     *
     * 15시
     * 15시30분
     * 15시 30분
     * 15:30
     *
     * 오전 10시
     * 오후 3시
     */

    const TIME =

        '(?:' +

            '\\s*' +

            '(?:오전|오후)?' +

            '\\s*' +

            '(?:' +

                /*
                 * 15:30
                 */

                '(?:[01]?\\d|2[0-3])' +
                ':' +
                '[0-5]\\d' +

            '|' +

                /*
                 * 15시
                 * 15시30분
                 * 15시 30분
                 */

                '(?:[01]?\\d|2[0-3])' +
                '시' +
                '(?:\\s*[0-5]?\\d\\s*분)?' +

            ')' +

        ')?';



    /*
     * 최종 패턴
     *
     * 날짜 + 요일 + 시간
     */

    const DATE_PATTERN =
        DATE_CORE +
        WEEKDAY +
        TIME;



    const dateRegex =
        new RegExp(
            DATE_PATTERN,
            'g'
        );



    /*
     * =========================================================
     * 제목 링크 탐색
     * =========================================================
     */

    list
        .querySelectorAll('a')
        .forEach(function(link) {


            if (
                !link.textContent ||
                !link.textContent.trim()
            ) {

                return;

            }



            /*
             * 이미 날짜 배지 안에 있는 것은
             * 다시 처리하지 않음
             */

            const walker =
                document.createTreeWalker(

                    link,

                    NodeFilter.SHOW_TEXT,

                    {

                        acceptNode:function(node) {


                            if (
                                !node.nodeValue ||
                                !node.nodeValue.trim()
                            ) {

                                return NodeFilter.FILTER_REJECT;

                            }


                            const parent =
                                node.parentElement;


                            if (!parent) {

                                return NodeFilter.FILTER_REJECT;

                            }



                            /*
                             * 기존 날짜 배지 제외
                             */

                            if (
                                parent.closest(
                                    '.tm-mail-date-badge'
                                )
                            ) {

                                return NodeFilter.FILTER_REJECT;

                            }



                            /*
                             * 답장/전달 배지 제외
                             */

                            if (
                                parent.closest(
                                    '.tm-mail-badge'
                                )
                            ) {

                                return NodeFilter.FILTER_REJECT;

                            }



                            return NodeFilter.FILTER_ACCEPT;

                        }

                    }

                );



            const textNodes = [];

            let node;


            while (
                (node = walker.nextNode())
            ) {

                textNodes.push(
                    node
                );

            }



            /*
             * =================================================
             * 각 텍스트 노드 처리
             * =================================================
             */

            textNodes.forEach(function(textNode) {


                const text =
                    textNode.nodeValue;


                if (!text) {
                    return;
                }



                /*
                 * 정규식 초기화
                 */

                dateRegex.lastIndex = 0;



                /*
                 * 날짜가 없으면 종료
                 */

                if (
                    !dateRegex.test(text)
                ) {

                    return;

                }


                dateRegex.lastIndex = 0;



                /*
                 * 새 DOM 생성
                 */

                const fragment =
                    document.createDocumentFragment();


                let lastIndex = 0;

                let match;



                while (
                    (match =
                        dateRegex.exec(text))
                ) {


                    /*
                     * 날짜 앞 일반 텍스트
                     */

                    if (
                        match.index >
                        lastIndex
                    ) {

                        fragment.appendChild(

                            document.createTextNode(

                                text.substring(
                                    lastIndex,
                                    match.index
                                )

                            )

                        );

                    }



                    /*
                     * 날짜/요일/시간 배지
                     */

                    const badge =
                        document.createElement(
                            'span'
                        );


                    badge.className =
                        'tm-mail-date-badge';


                    badge.textContent =
                        match[0];


                    fragment.appendChild(
                        badge
                    );



                    lastIndex =
                        dateRegex.lastIndex;

                }



                /*
                 * 날짜 뒤 일반 텍스트
                 */

                if (
                    lastIndex <
                    text.length
                ) {

                    fragment.appendChild(

                        document.createTextNode(

                            text.substring(
                                lastIndex
                            )

                        )

                    );

                }



                /*
                 * 기존 텍스트 교체
                 */

                textNode.parentNode.replaceChild(

                    fragment,

                    textNode

                );

            });

        });

}


    function processBadgeText(node) {

        if (
            !node ||
            !node.parentNode
        ) {
            return;
        }


        const text =
            node.nodeValue;

        if (!text) {
            return;
        }


        const replyRegex =
            /^(\s*)\[\s*답장\s*\]\s*/;

        const forwardRegex =
            /^(\s*)\[\s*전달\s*\]\s*/;


        let type = null;
        let regex = null;


        if (
            replyRegex.test(text)
        ) {

            type = 'reply';
            regex = replyRegex;

        }
        else if (
            forwardRegex.test(text)
        ) {

            type = 'forward';
            regex = forwardRegex;

        }
        else {

            return;
        }


        const badge =
            document.createElement('span');


        badge.classList.add(
            'tm-mail-badge'
        );


        if (
            type === 'reply'
        ) {

            badge.classList.add(
                'tm-mail-reply'
            );

            badge.textContent =
                '[답장]';

        }
        else {

            badge.classList.add(
                'tm-mail-forward'
            );

            badge.textContent =
                '[전달]';

        }


        node.nodeValue =
            text.replace(
                regex,
                ''
            );


        node.parentNode.insertBefore(
            badge,
            node
        );

    }



    /* =========================================================
       지운편지함 "비우기" 문구 제거
       ========================================================= */

    function removeTrashText() {

        document
            .querySelectorAll(
                '.btn_trshbx_dl'
            )
            .forEach(function (button) {

                button.style.removeProperty(
                    'display'
                );


                Array.from(
                    button.childNodes
                )
                .forEach(function (node) {

                    if (
                        node.nodeType ===
                        Node.TEXT_NODE
                    ) {

                        node.nodeValue =
                            node.nodeValue.replace(
                                /비우기/g,
                                ''
                            );

                    }

                });


                button.setAttribute(
                    'title',
                    '지운 편지함 비우기'
                );

                button.setAttribute(
                    'aria-label',
                    '지운 편지함 비우기'
                );

            });

    }



    /* =========================================================
       이동 버튼 옆 "select" 문구 제거
       ========================================================= */

   function removeMoveSelectText() {

    document
        .querySelectorAll('.slt_solo > a')
        .forEach(function (link) {

            const href =
                link.getAttribute('href') || '';


            /*
             * toggleMove 링크만 확인
             */
            if (
                !href.includes('toggleMove')
            ) {
                return;
            }


            /*
             * 디버깅용:
             * 현재 textContent를 팝업으로 표시
             */
            //alert(
            //    'toggleMove 링크 발견\n\n' +
            //    'textContent = [' +
            //    link.textContent +
            //    ']'
            //);


            /*
             * 일단 제거 로직은 그대로 유지
             */
            if (
                (link.textContent || '')
                    .trim().toLowerCase() === 'select'
            ) {

                link.textContent = '';

            }
            else{
                link.textContent = '';
            }


            link.setAttribute(
                'title',
                '이동할 편지함 선택'
            );

            link.setAttribute(
                'aria-label',
                '이동할 편지함 선택'
            );

        });

}



    /* =========================================================
       메일 본문 폰트 보정
       ========================================================= */

    function improveMailFont() {

        const mail =
            document.getElementById(
                'normal_message_content'
            );

        if (!mail) {
            return;
        }


        mail
            .querySelectorAll(
                'p, div, span, li, td, th, a'
            )
            .forEach(function (el) {

                if (
                    !el.textContent ||
                    !el.textContent.trim()
                ) {
                    return;
                }


                el.style.setProperty(
                    'font-family',
                    FONT_FAMILY,
                    'important'
                );

            });

    }



    /* =========================================================
       전체 적용
       ========================================================= */

    function applyKRISSMailChanges() {

        scanMailBadges();

        highlightDatesInSubject();

        removeTrashText();

        removeMoveSelectText();

        improveMailFont();

    }



    /* 최초 실행 */

    applyKRISSMailChanges();



    /* =========================================================
       AJAX 화면 갱신 대응
       ========================================================= */

    let updateTimer = null;


    const observer =
        new MutationObserver(function () {

            clearTimeout(
                updateTimer
            );


            updateTimer =
                setTimeout(function () {

                    applyKRISSMailChanges();

                }, 100);

        });



    observer.observe(
        document.body,
        {
            childList:true,
            subtree:true
        }
    );



    /* =========================================================
       구형 AJAX/jQuery 대응
       ========================================================= */

    setInterval(function () {

        removeTrashText();

        removeMoveSelectText();

    }, 1000);



    console.log(
        '[Tampermonkey] KRISS Mail Clean v8 적용 완료'
    );

})();