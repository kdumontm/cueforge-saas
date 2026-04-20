/**
 * Card — Conteneur avec bordure et ombre
 *
 * Composables : Card (root) + CardHeader + CardBody + CardFooter
 *
 * Props:
 * - Card : hover?: boolean, className?: string
 * - CardHeader/Body/Footer : className?: string
 *
 * @example
 * <Card hover>
 *   <CardHeader>
 *     <h3>Titre</h3>
 *   </CardHeader>
 *   <CardBody>Contenu</CardBody>
 *   <CardFooter>Pied de page</CardFooter>
 * </Card>
 */

import React from "react";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
}

interface CardSectionProps extends React.HTMLAttributes<HTMLDivElement> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ hover = false, className = "", children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`
          bg-white
          border border-neutral-200
          rounded-xl
          shadow-sm
          ${hover ? "hover:shadow-md hover:border-neutral-300 transition-shadow duration-200" : ""}
          ${className}
        `}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, CardSectionProps>(
  ({ className = "", children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`px-6 py-4 border-b border-neutral-100 ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

CardHeader.displayName = "CardHeader";

const CardBody = React.forwardRef<HTMLDivElement, CardSectionProps>(
  ({ className = "", children, ...props }, ref) => {
    return (
      <div ref={ref} className={`px-6 py-4 ${className}`} {...props}>
        {children}
      </div>
    );
  }
);

CardBody.displayName = "CardBody";

const CardFooter = React.forwardRef<HTMLDivElement, CardSectionProps>(
  ({ className = "", children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`px-6 py-3 bg-neutral-50 border-t border-neutral-100 rounded-b-xl ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardBody, CardFooter };
export default Card;
