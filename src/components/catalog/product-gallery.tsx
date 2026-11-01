"use client";

/* eslint-disable @next/next/no-img-element */
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  PackageCheck,
} from "lucide-react";
import { useRef, useState } from "react";

type GalleryImage = {
  id: string;
  url: string;
  alt: string;
};

export function ProductGallery({
  images,
  locale,
  productName,
}: {
  images: GalleryImage[];
  locale: "fr" | "ar";
  productName: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStart = useRef<number | null>(null);
  const activeImage = images[activeIndex];

  const showPrevious = () =>
    setActiveIndex((current) =>
      current === 0 ? images.length - 1 : current - 1,
    );
  const showNext = () =>
    setActiveIndex((current) =>
      current === images.length - 1 ? 0 : current + 1,
    );

  if (!activeImage) {
    return (
      <div className="product-gallery product-gallery--empty">
        <PackageCheck size={76} />
        <span>{locale === "ar" ? "لا توجد صور" : "Aucune image"}</span>
      </div>
    );
  }

  return (
    <section
      className="product-gallery"
      aria-label={locale === "ar" ? "صور المنتج" : "Photos du produit"}
    >
      <div
        className="product-gallery__stage"
        onTouchStart={(event) => {
          touchStart.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          if (touchStart.current === null || images.length < 2) return;
          const distance =
            (event.changedTouches[0]?.clientX ?? touchStart.current) -
            touchStart.current;
          if (Math.abs(distance) > 45) {
            if (distance > 0) showPrevious();
            else showNext();
          }
          touchStart.current = null;
        }}
      >
        <img
          key={activeImage.id}
          src={activeImage.url}
          alt={activeImage.alt || productName}
          fetchPriority="high"
        />
        <span className="product-gallery__counter" aria-live="polite">
          <b dir="ltr">
            {activeIndex + 1} / {images.length}
          </b>
        </span>
        <a
          className="product-gallery__expand"
          href={activeImage.url}
          target="_blank"
          rel="noreferrer"
          aria-label={locale === "ar" ? "فتح الصورة" : "Ouvrir l’image"}
        >
          <Maximize2 size={17} />
        </a>
        {images.length > 1 ? (
          <>
            <button
              className="product-gallery__arrow product-gallery__arrow--previous"
              type="button"
              onClick={showPrevious}
              aria-label={
                locale === "ar" ? "الصورة السابقة" : "Photo précédente"
              }
            >
              <ChevronLeft size={21} />
            </button>
            <button
              className="product-gallery__arrow product-gallery__arrow--next"
              type="button"
              onClick={showNext}
              aria-label={locale === "ar" ? "الصورة التالية" : "Photo suivante"}
            >
              <ChevronRight size={21} />
            </button>
          </>
        ) : null}
      </div>
      {images.length > 1 ? (
        <div className="product-gallery__rail">
          {images.map((image, index) => (
            <button
              className="product-gallery__thumbnail"
              type="button"
              aria-current={index === activeIndex ? "true" : undefined}
              aria-label={
                locale === "ar"
                  ? `عرض الصورة ${index + 1}`
                  : `Afficher la photo ${index + 1}`
              }
              onClick={() => setActiveIndex(index)}
              key={image.id}
            >
              <img
                src={image.url}
                alt=""
                loading={index > 5 ? "lazy" : "eager"}
              />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
