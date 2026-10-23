/* Durable notification state decisions. Pure and read-only: caller owns persistence and delivery. */
import {notificationKey} from "./hoa-rules.js";
export function planHOANotification(evaluation, previous = null) {
  if (!evaluation || !evaluation.propertyId || !evaluation.dueDate ||
      !/^\d{4}-\d{2}-\d{2}$/.test(evaluation.observedOn || "")) throw new Error("Invalid evaluation");
  const type=evaluation.alertType;
  if (!type) return {send:false,reason:"no_alert"};
  const key=notificationKey(evaluation.propertyId,evaluation.dueDate,type);
  if (previous?.key===key && previous?.deliveryStatus==="sent") return {send:false,key,reason:"already_sent"};
  if (previous?.key===key && previous?.deliveryStatus==="pending") return {send:false,key,reason:"delivery_pending"};
  return {send:true,key,reason:"new_or_retryable",type};
}
export function recordHOADelivery(plan, deliveredAt, deliveryStatus) {
  if (!plan?.send || !plan.key || !["sent","failed","pending"].includes(deliveryStatus) ||
      !/^\d{4}-\d{2}-\d{2}T/.test(deliveredAt || "")) throw new Error("Invalid delivery receipt");
  return {key:plan.key,deliveryStatus,updatedAt:deliveredAt};
}
