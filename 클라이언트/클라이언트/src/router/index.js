import { createWebHistory, createRouter } from "vue-router";
import AISPage from "@/page/AISPage.vue"

const routes = [
    {
        path: "/",
        name: "AIS",
        component: AISPage
    },
];

const router = createRouter({
    history: createWebHistory(),
    routes,
    scrollBehavior() {
        return { top: 0 };
    },
});

router.beforeEach(async (to, from, next) => {
    // if (to.matched.length === 0) {
    //     alert("잘못된 경로입니다");
    //     return ;
    // }

    // // problem 라우트에 대한 검사
    // if (to.name === "Problem" && to.meta.allowedCategories) {
    //     const category = to.query.category;
    //     if (!to.meta.allowedCategories.includes(category)) {
    //         alert("잘못된 사이트 경로입니다.");
    //         return next({ name: "Home" }); // 홈으로 리다이렉트하거나 적절한 처리 수행
    //     }
    // } else if (to.name == "AddQna") {
    //     const store = useStore();
    //     try {
    //         const userProfile = await store.dispatch("getUserProfile")
    //         if (userProfile.id == null) {
    //             alert("로그인이 필요합니다.")
    //             return router.back();
    //         }
    //     } catch(err) {
    //         console.log(err);
    //         alert("로그인이 필요합니다.")
    //         return router.back();
    //     }
    // } 
    next(); // 검증 후 문제 없으면 네비게이션을 계속 진행
});

export default router;
