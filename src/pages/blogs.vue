<script setup lang="ts">
import { IonContent, IonPage } from '@ionic/vue'
import { initBlog, stringToDate } from '~/services/blog'

useHead({
  title: 'Capgo | Capacitor Blog',
  meta: [
    { name: 'description', content: 'Check our blog to learn more about Capacitor and live updates.' },
    { name: 'og:type', content: 'website' },
    { name: 'og:title', content: 'Capgo | Capacitor Blog' },
    { name: 'twitter:title', content: 'Capgo | Capacitor Blog' },
    { name: 'twitter:image', content: `https://${import.meta.env.domain}/blog_meta.webp` },
    { name: 'og:image:alt', content: 'Capgo illustration' },
    { name: 'og:image', content: `https://${import.meta.env.domain}/blog_meta.webp` },
    { name: 'og:alt', content: 'Capgo illustration' },
    { name: 'og:url', content: `https://${import.meta.env.domain}/blogs` },
  ],
})

const blogs = initBlog()

</script>
<template>
  <IonPage>
    <IonContent :fullscreen="true">
      <div class="overflow-x-hidden bg-gray-900 text-white">
        <Header />
        <section class="py-10 bg-black sm:py-16 lg:py-24">
          <div class="px-4 mx-auto sm:px-6 lg:px-8 max-w-7xl">
            <div class="max-w-2xl mx-auto text-center">
              <h1 class="text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-5xl">
                Latest from our blog
              </h1>
              <p class="max-w-xl mx-auto mt-4 text-base leading-relaxed text-gray-50">
                The best articles to enhence your Crossfit experience.
              </p>
            </div>

            <div class="grid max-w-md grid-cols-1 gap-6 mx-auto mt-8 lg:mt-16 lg:grid-cols-3 lg:max-w-full">
              <div v-for="(article, index) in blogs" :key="index" class="overflow-hidden bg-white rounded shadow">
                <div class="p-5">
                  <div class="relative">
                    <a :href="article.path" :title="article.meta.frontmatter.title" class="block aspect-w-4 aspect-h-3">
                      <img class="object-cover w-full h-full rounded-lg" :src="article.meta.frontmatter.head_image" :alt="'blog illustration ' + article.meta.frontmatter.title">
                    </a>

                    <div class="absolute top-4 left-4">
                      <span class="px-4 py-2 text-xs font-semibold tracking-widest text-gray-900 uppercase bg-white rounded-full"> {{ article.meta.frontmatter.tag }} </span>
                    </div>
                  </div>
                  <span class="block mt-6 text-sm font-semibold tracking-widest text-gray-500 uppercase"> {{ stringToDate(article.meta.frontmatter.date) }} </span>
                  <p class="mt-5 text-2xl font-semibold">
                    <a :href="article.path" :title="article.meta.frontmatter.title" class="text-black"> {{ article.meta.frontmatter.title }} </a>
                  </p>
                  <p class="mt-4 text-base text-gray-600">
                    {{ article.meta.frontmatter.description }}
                  </p>
                  <a :href="article.path" :title="article.meta.frontmatter.title" class="inline-flex items-center justify-center pb-0.5 mt-5 text-base font-semibold text-blue-600 transition-all duration-200 border-b-2 border-transparent hover:border-blue-600 focus:border-blue-600">
                    Continue Reading
                    <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
                    </svg>
                  </a>
                </div>
              </div>
            </div>

            <div class="flex items-center justify-center mt-8 space-x-3 lg:hidden">
              <button type="button" class="flex items-center justify-center text-gray-400 transition-all duration-200 bg-transparent border border-gray-300 rounded w-9 h-9 hover:bg-blue-600 hover:text-white focus:bg-blue-600 focus:text-white">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <button type="button" class="flex items-center justify-center text-gray-400 transition-all duration-200 bg-transparent border border-gray-300 rounded w-9 h-9 hover:bg-blue-600 hover:text-white focus:bg-blue-600 focus:text-white">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </section>
      </div>
      <Footer />
    </IonContent>
  </IonPage>
</template>
